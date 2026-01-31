import 'package:flutter/material.dart';

import '../features/messages/room_page.dart';
import '../features/notifications/friend_requests_page.dart';
import '../features/posts/post_detail_page.dart';

class NotificationRouter {
  static final navigatorKey = GlobalKey<NavigatorState>();
  static final ValueNotifier<int> tabIndex = ValueNotifier<int>(0);

  static void handleMessageData(Map<String, dynamic> data) {
    final type = (data['type'] ?? '').toString();
    final postId = (data['post_id'] ?? '').toString();
    final commentId = (data['comment_id'] ?? '').toString();
    final friendshipId = (data['friendship_id'] ?? '').toString();
    final threadId = (data['thread_id'] ?? '').toString();

    if (type == 'friend_request') {
      tabIndex.value = 2;
      navigatorKey.currentState?.push(
        MaterialPageRoute(builder: (_) => const FriendRequestsPage()),
      );
      return;
    }

    if (type == 'chat_message' && threadId.isNotEmpty) {
      navigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => ChatRoomPage(
            threadId: threadId,
            threadTitle: 'Chat',
          ),
        ),
      );
      return;
    }

    if (postId.isNotEmpty) {
      tabIndex.value = 0;
      final openComments = type == 'post_comment' || type == 'comment_reply' || type == 'comment_like';
      navigatorKey.currentState?.push(
        MaterialPageRoute(
          builder: (_) => PostDetailPage(
            postId: postId,
            highlightCommentId: commentId.isNotEmpty ? commentId : null,
            openComments: openComments,
          ),
        ),
      );
      return;
    }

    // Fallback to notifications tab
    tabIndex.value = 2;
  }
}
