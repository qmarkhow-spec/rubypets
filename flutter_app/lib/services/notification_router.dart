import 'package:flutter/material.dart';

import '../features/notifications/friend_requests_page.dart';
import '../features/notifications/notification_target_page.dart';

class NotificationRouter {
  static final navigatorKey = GlobalKey<NavigatorState>();
  static final ValueNotifier<int> tabIndex = ValueNotifier<int>(0);

  static void handleMessageData(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString();
    final postId = (data['post_id'] ?? '').toString();
    final commentId = (data['comment_id'] ?? '').toString();
    final friendshipId = (data['friendship_id'] ?? '').toString();

    if (type == 'friend_request') {
      tabIndex.value = 2;
      navigatorKey.currentState?.push(
        MaterialPageRoute(builder: (_) => const FriendRequestsPage()),
      );
      return;
    }

    if (postId.isNotEmpty) {
      tabIndex.value = 0;
      navigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => NotificationTargetPage(
            type: type,
            postId: postId,
            commentId: commentId,
            friendshipId: friendshipId,
          ),
        ),
      );
      return;
    }

    // Fallback to notifications tab
    tabIndex.value = 2;
  }
}
