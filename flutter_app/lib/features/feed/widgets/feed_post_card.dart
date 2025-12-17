import 'package:flutter/material.dart';

import '../models/feed_post.dart';

class FeedPostCard extends StatelessWidget {
  const FeedPostCard({
    super.key,
    required this.post,
    this.onMore,
    this.onLike,
    this.onComment,
    this.onRepost,
    this.onBookmark,
  });

  final FeedPost post;
  final VoidCallback? onMore;
  final VoidCallback? onLike;
  final VoidCallback? onComment;
  final VoidCallback? onRepost;
  final VoidCallback? onBookmark;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: colorScheme.primaryContainer,
                  child: const Icon(Icons.pets),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.ownerDisplayName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        '${post.petDisplayName} · ${post.timeLabel}',
                        style: TextStyle(color: colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.more_vert),
                  onPressed: onMore,
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(post.content),
            if (post.mediaLabel != null) ...[
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  height: 180,
                  color: colorScheme.primaryContainer.withValues(alpha: 102),
                  child: Center(
                    child: Text(
                      post.mediaLabel!,
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                ),
              ),
            ],
            if (post.tags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: post.tags
                    .map(
                      (tag) => Chip(
                        label: Text(tag),
                        avatar: const Icon(Icons.tag, size: 16),
                      ),
                    )
                    .toList(),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _ActionButton(
                  icon: Icons.favorite_border,
                  label: post.likes.toString(),
                  onPressed: onLike,
                ),
                _ActionButton(
                  icon: Icons.chat_bubble_outline,
                  label: post.comments.toString(),
                  onPressed: onComment,
                ),
                _ActionButton(
                  icon: Icons.repeat,
                  label: post.shares.toString(),
                  onPressed: onRepost,
                ),
                IconButton(
                  icon: const Icon(Icons.bookmark_border),
                  onPressed: onBookmark,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon),
      label: Text(label),
    );
  }
}
