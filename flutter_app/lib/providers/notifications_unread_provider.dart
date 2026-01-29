import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session_provider.dart';

final notificationsUnreadCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final session = ref.watch(sessionProvider);
  if (session.valueOrNull == null) return 0;
  final api = ref.watch(apiClientProvider);
  return api.getUnreadNotificationCount();
});
