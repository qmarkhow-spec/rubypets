import 'package:flutter/material.dart';

class NotificationTargetPage extends StatelessWidget {
  const NotificationTargetPage({
    super.key,
    required this.type,
    required this.postId,
    required this.commentId,
    required this.friendshipId,
  });

  final String type;
  final String postId;
  final String commentId;
  final String friendshipId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notification')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Type: $type', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Post ID: ${postId.isEmpty ? '-' : postId}'),
            Text('Comment ID: ${commentId.isEmpty ? '-' : commentId}'),
            Text('Friendship ID: ${friendshipId.isEmpty ? '-' : friendshipId}'),
            const SizedBox(height: 16),
            const Text(
              'This is a placeholder detail page. Replace with a real post detail view when available.',
            ),
          ],
        ),
      ),
    );
  }
}
