class PlpChatFallback {
  const PlpChatFallback._();

  static String? deterministicReply({
    required String message,
    required Map<String, Object?>? enterpriseContext,
  }) {
    if (!_isPlpContext(enterpriseContext)) return null;
    final normalized = message.trim().toLowerCase();
    if (normalized.isEmpty || !isReadOnlyTurn(message)) return null;

    final context = enterpriseContext!;
    final today = _map(context['today']);
    final source = _map(context['sourceHealth'] ?? context['source']);

    if (const {'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening'}.contains(normalized)) {
      return 'Hello. How can I help with PLP today?';
    }

    final occupancy = _percentage(today['occupancy_percent']);
    final occupied = _integer(today['occupied_rooms']);
    final rooms = _integer(today['rooms_total']);
    final available = _integer(today['rooms_available']);
    final arrivals = _integer(today['arrivals_today']);
    final departures = _integer(today['departures_today']);
    final sales = _money(today['sales_today_php']);
    final tasks = _integer(today['open_staff_tasks']);
    final conflicts = _integer(today['open_ota_conflicts']);

    final state = _text(source['state'], fallback: 'unknown').toLowerCase();
    final detail = _text(source['message'], fallback: 'No current provider status message is recorded.');
    final hasMockRecords = source['has_mock'] == true ||
        source['hasMock'] == true ||
        context['has_mock'] == true ||
        context['hasMock'] == true;
    final isStaleLike = hasMockRecords ||
        const {
          'stale',
          'unknown',
          'unavailable',
          'not_connected',
          'disconnected',
          'mock',
          'mocked',
          'demo',
          'expired',
          'error',
        }.contains(state);

    if (const {
      'how are things', 'how are things?', 'how is everything', 'how is everything?',
      'how is the resort', 'how is the resort?', 'how are things at plp', 'how are things at plp?',
      'what is happening', 'what is happening?', 'whats happening', 'whats happening?',
      'how is plp', 'how is plp?', 'resort status', 'status',
    }.contains(normalized)) {
      if (isStaleLike) {
        final mockNote = hasMockRecords
            ? ' Mock/QA records are also flagged in the available context.'
            : '';
        return 'PLP status: source state is $state. $detail$mockNote The figures available here are from the last synchronized snapshot, not a live provider refresh.\n\nNext steps: verify the customer tenant, connect or repair its approved PMS/OTA integration, complete a successful provider sync, and quarantine mock records only after confirming they are test data. The backend must verify freshness and source health before this can be described as live.';
      }
      return 'PLP status: source state is $state. $detail';
    }

    if (normalized.contains('what do we need to do') ||
        normalized.contains('what do we need') ||
        normalized.contains('how do we fix') ||
        normalized.contains('how to fix') ||
        normalized.contains('make it live') ||
        normalized.contains('make live') ||
        normalized.contains('refresh source') ||
        normalized.contains('update source')) {
      if (isStaleLike) {
        return 'To move PLP from $state toward verified live data:\n'
            '1. Confirm the active organization is the intended customer tenant, not demo or staging.\n'
            '2. Check the approved PMS/OTA integration and its authorization; reconnect it if needed.\n'
            '3. Run the supported provider synchronization and inspect its result.\n'
            '4. Quarantine mock/QA records only after confirming their tenant and test-data provenance; do not delete real guest or financial records.\n'
            '5. Refresh the workspace and confirm a fresh observation timestamp and healthy source status from the backend.\n\n'
            'Do not manually mark source_status healthy or advance source_observed_at to simulate success. This chat fallback cannot run a provider refresh or verify live data; figures remain snapshot data until the backend confirms a successful sync.';
      }
      if (hasMockRecords) {
        return 'The reported source state is $state, but mock/QA records are flagged. $detail Verify tenant and record provenance, quarantine only confirmed test data, then run and verify the approved provider sync. This fallback cannot certify the data as live.';
      }
      return 'The reported source state is $state. $detail This fallback cannot independently verify provider freshness. Confirm the latest successful backend sync and observation timestamp before treating the data as live.';
    }

    final suffix =
        ' This is from the last synchronized PLP snapshot; Pandora did not refresh a provider during this turn.';

    if (normalized.contains('occupancy')) {
      if ([occupancy, occupied, rooms, available].contains('unavailable')) {
        return 'PLP occupancy: $occupancy; occupied rooms: $occupied; total rooms: $rooms; available rooms: $available.$suffix';
      }
      return 'PLP occupancy is $occupancy: $occupied of $rooms rooms occupied, with $available available.$suffix';
    }
    if (normalized.contains('arrival') ||
        normalized.contains('checking in') ||
        normalized.contains('check in')) {
      if (arrivals == 'unavailable') {
        return 'PLP arrival data is unavailable in this snapshot.$suffix';
      }
      return 'PLP has $arrivals arrival${arrivals == '1' ? '' : 's'} today.$suffix';
    }
    if (normalized.contains('departure') ||
        normalized.contains('checking out') ||
        normalized.contains('check out')) {
      if (departures == 'unavailable') {
        return 'PLP departure data is unavailable in this snapshot.$suffix';
      }
      return 'PLP has $departures departure${departures == '1' ? '' : 's'} today.$suffix';
    }
    if (normalized.contains('revenue') ||
        normalized.contains('sales') ||
        normalized.contains('made today') ||
        normalized.contains('earnings')) {
      if (sales == 'unavailable') {
        return 'PLP sales data is unavailable; this snapshot has no valid sales total.$suffix';
      }
      return 'PLP sales today are $sales.$suffix';
    }
    if (normalized.contains('ota') || normalized.contains('conflict')) {
      if (conflicts == 'unavailable') {
        return 'PLP OTA conflict data is unavailable in this snapshot.$suffix';
      }
      return 'PLP has $conflicts open OTA conflict${conflicts == '1' ? '' : 's'}.$suffix';
    }
    if (normalized.contains('available room') ||
        (normalized.contains('room') && normalized.contains('available'))) {
      if ([available, rooms].contains('unavailable')) {
        return 'PLP room availability: $available; total rooms: $rooms.$suffix';
      }
      return 'PLP has $available of $rooms rooms available in the snapshot.$suffix';
    }
    if (normalized.contains('task') ||
        normalized.contains('needs attention') ||
        normalized.contains('need my attention') ||
        normalized.contains('attention')) {
      if ([tasks, conflicts, arrivals, departures].contains('unavailable')) {
        return 'PLP attention snapshot: open staff tasks: $tasks; OTA conflicts: $conflicts; arrivals: $arrivals; departures: $departures.$suffix';
      }
      return 'PLP currently has $tasks open staff task${tasks == '1' ? '' : 's'} and $conflicts open OTA conflict${conflicts == '1' ? '' : 's'}. There are $arrivals arrival${arrivals == '1' ? '' : 's'} and $departures departure${departures == '1' ? '' : 's'} today.$suffix';
    }
    if (normalized.contains('source') ||
        normalized.contains('connected') ||
        normalized.contains('provider status') ||
        normalized.contains('data live') ||
        normalized.contains('data current')) {
      return 'PLP source state is $state. $detail.$suffix';
    }
    if (normalized == 'today' ||
        normalized.contains('summarize') ||
        normalized.contains('summary') ||
        normalized.contains('brief me') ||
        normalized.contains("today's briefing") ||
        normalized.contains('today briefing') ||
        normalized.contains('resort summary') ||
        normalized.contains('business summary')) {
      if ([occupancy, arrivals, departures, sales, tasks, conflicts]
          .contains('unavailable')) {
        return 'PLP snapshot: occupancy: $occupancy; arrivals: $arrivals; departures: $departures; sales: $sales; open staff tasks: $tasks; OTA conflicts: $conflicts.$suffix';
      }
      return 'PLP today: $occupancy occupancy, $arrivals arrival${arrivals == '1' ? '' : 's'}, $departures departure${departures == '1' ? '' : 's'}, $sales in sales, $tasks open staff task${tasks == '1' ? '' : 's'}, and $conflicts open OTA conflict${conflicts == '1' ? '' : 's'}.$suffix';
    }
    return null;
  }

  static bool isReadOnlyTurn(String message) {
    final value = message.trim().toLowerCase();
    if (value.isEmpty) return true;
    final imperative = RegExp(
      r'^(?:please\s+)?(?:create|add|assign|set|update|change|edit|delete|remove|cancel|book|reserve|send|call|message|email|publish|deploy|merge|approve|reject|pay|refund|charge|invite|grant|revoke|schedule|reschedule)\b',
    );
    final delegated = RegExp(
      r'\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:create|add|assign|set|update|change|edit|delete|remove|cancel|book|reserve|send|call|message|email|publish|deploy|merge|approve|reject|pay|refund|charge|invite|grant|revoke|schedule|reschedule)\b',
    );
    return !imperative.hasMatch(value) && !delegated.hasMatch(value);
  }

  static String? continuityNotice({
    required bool actionLike,
  }) {
    if (actionLike) {
      return 'Pandora is preserving this request without repeating the action or claiming completion. Check Activity for any verified provider result before you send the same action again.';
    }
    return null;
  }

  static bool _isPlpContext(Map<String, Object?>? context) {
    if (context == null || context.isEmpty) return false;
    final organization = _map(context['organization']);
    return _text(organization['propertySlug']) == 'plp-boracay';
  }

  static Map<String, Object?> _map(Object? value) {
    if (value is Map<String, Object?>) return value;
    if (value is Map) {
      return value.map((key, item) => MapEntry(key.toString(), item));
    }
    return const <String, Object?>{};
  }

  static String _text(Object? value, {String fallback = 'unavailable'}) {
    final text = value?.toString().trim();
    return text == null || text.isEmpty ? fallback : text;
  }

  static num? _finiteNumber(Object? value) {
    final parsed = value is num
        ? value
        : value is String
            ? num.tryParse(value.trim())
            : null;
    if (parsed == null || !parsed.isFinite || parsed.abs() > 9007199254740991) {
      return null;
    }
    return parsed;
  }

  static String _percentage(Object? value) {
    final parsed = _finiteNumber(value);
    if (parsed == null || parsed < 0 || parsed > 100) return 'unavailable';
    final text = parsed == parsed.roundToDouble()
        ? parsed.toInt().toString()
        : parsed.toString();
    return '$text%';
  }

  static String _integer(Object? value) {
    final parsed = _finiteNumber(value);
    if (parsed == null || parsed < 0 || parsed != parsed.roundToDouble()) {
      return 'unavailable';
    }
    return parsed.toInt().toString();
  }

  static String _money(Object? value) {
    final parsed = _finiteNumber(value);
    if (parsed == null) return 'unavailable';
    final rounded = parsed.round().abs().toString();
    final grouped = StringBuffer();
    for (var index = 0; index < rounded.length; index += 1) {
      if (index > 0 && (rounded.length - index) % 3 == 0) {
        grouped.write(',');
      }
      grouped.write(rounded[index]);
    }
    return '${parsed.isNegative ? '-' : ''}₱$grouped';
  }
}
