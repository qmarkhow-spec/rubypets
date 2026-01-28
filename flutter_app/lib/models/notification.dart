class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.actorCount,
    required this.actors,
    required this.postId,
    required this.commentId,
    required this.friendshipId,
    required this.isRead,
    required this.latestActionAt,
    required this.createdAt,
  });

  final String id;
  final String type;
  final int actorCount;
  final List<NotificationActor> actors;
  final String postId;
  final String commentId;
  final String friendshipId;
  final bool isRead;
  final String latestActionAt;
  final String createdAt;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final actorsRaw = json['actors'] as List<dynamic>? ?? [];
    final actors = actorsRaw
        .whereType<Map<String, dynamic>>()
        .map(NotificationActor.fromJson)
        .toList();

    return AppNotification(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      actorCount: (json['actor_count'] as num?)?.toInt() ?? 0,
      actors: actors,
      postId: json['post_id']?.toString() ?? '',
      commentId: json['comment_id']?.toString() ?? '',
      friendshipId: json['friendship_id']?.toString() ?? '',
      isRead: json['is_read'] == true,
      latestActionAt: json['latest_action_at']?.toString() ?? '',
      createdAt: json['created_at']?.toString() ?? '',
    );
  }
}

class NotificationActor {
  NotificationActor({required this.ownerId, required this.displayName});

  final String ownerId;
  final String displayName;

  factory NotificationActor.fromJson(Map<String, dynamic> json) {
    return NotificationActor(
      ownerId: json['ownerId']?.toString() ?? '',
      displayName: json['displayName']?.toString() ?? '',
    );
  }
}

class NotificationsPage {
  NotificationsPage({required this.items, required this.nextCursor});

  final List<AppNotification> items;
  final String? nextCursor;
}
