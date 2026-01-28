import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/notification.dart';
import '../../models/user.dart';
import '../../providers/notifications_provider.dart';
import '../../providers/session_provider.dart';
import '../../services/notification_router.dart';

class NotificationsPage extends ConsumerStatefulWidget {
  const NotificationsPage({super.key});

  @override
  ConsumerState<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends ConsumerState<NotificationsPage> {
  ProviderSubscription<AsyncValue<ApiUser?>>? _sessionSub;

  @override
  void initState() {
    super.initState();
    _sessionSub = ref.listenManual<AsyncValue<ApiUser?>>(sessionProvider, (_, __) {
      ref.invalidate(notificationsProvider);
    });
  }

  @override
  void dispose() {
    _sessionSub?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final state = ref.watch(notificationsProvider);

    return session.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => Center(child: Text('Failed to load: $err')),
      data: (user) {
        if (user == null) {
          return const Center(child: Text('Sign in to view notifications.'));
        }
        return state.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Failed to load: $err')),
          data: (page) {
            if (page.items.isEmpty) {
              return RefreshIndicator(
                onRefresh: () => ref.refresh(notificationsProvider.future),
                child: ListView(
                  padding: const EdgeInsets.all(24),
                  children: const [
                    SizedBox(height: 120),
                    Icon(Icons.notifications_none, size: 48),
                    SizedBox(height: 12),
                    Text(
                      'No notifications yet.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              );
            }

            return RefreshIndicator(
              onRefresh: () => ref.refresh(notificationsProvider.future),
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemBuilder: (context, index) {
                  final item = page.items[index];
                  return _NotificationTile(item: item);
                },
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemCount: page.items.length,
              ),
            );
          },
        );
      },
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.item});

  final AppNotification item;

  @override
  Widget build(BuildContext context) {
    final title = _buildTitle(item);
    final time = _formatTime(item.latestActionAt.isNotEmpty ? item.latestActionAt : item.createdAt);
    final icon = _iconForType(item.type);
    final isUnread = !item.isRead;

    return ListTile(
      tileColor: Theme.of(context).colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      leading: Icon(
        icon,
        color: Theme.of(context).colorScheme.primary,
      ),
      title: Text(
        title,
        style: TextStyle(fontWeight: isUnread ? FontWeight.w700 : FontWeight.w500),
      ),
      subtitle: Text(time),
      trailing: isUnread
          ? Icon(Icons.circle, size: 10, color: Theme.of(context).colorScheme.primary)
          : null,
      onTap: () {
        NotificationRouter.handleMessageData({
          'type': item.type,
          'post_id': item.postId,
          'comment_id': item.commentId,
          'friendship_id': item.friendshipId,
          'notif_id': item.id,
        });
      },
    );
  }
}

String _buildTitle(AppNotification item) {
  final names = item.actors.map((actor) => actor.displayName).where((name) => name.isNotEmpty).toList();
  final a = names.isNotEmpty ? names[0] : 'Someone';
  final b = names.length > 1 ? names[1] : 'Someone';

  switch (item.type) {
    case 'post_like':
      return _buildAggregated(a, b, item.actorCount, 'liked your post');
    case 'comment_like':
      return _buildAggregated(a, b, item.actorCount, 'liked your comment');
    case 'post_comment':
      return '$a commented on your post';
    case 'comment_reply':
      return '$a replied to your comment';
    case 'friend_request':
      return '$a sent you a friend request';
    default:
      return 'You have a new notification';
  }
}

String _buildAggregated(String a, String b, int count, String action) {
  if (count <= 1) return '$a $action';
  if (count == 2) return '$a and $b $action';
  final others = count - 2;
  return '$a, $b and $others others $action';
}

IconData _iconForType(String type) {
  switch (type) {
    case 'post_like':
      return Icons.favorite;
    case 'comment_like':
      return Icons.favorite_border;
    case 'post_comment':
      return Icons.chat_bubble_outline;
    case 'comment_reply':
      return Icons.reply;
    case 'friend_request':
      return Icons.person_add_alt_1;
    default:
      return Icons.notifications;
  }
}

String _formatTime(String iso) {
  if (iso.isEmpty) return '';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return '';
  final diff = DateTime.now().difference(parsed);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${parsed.month}/${parsed.day}';
}
