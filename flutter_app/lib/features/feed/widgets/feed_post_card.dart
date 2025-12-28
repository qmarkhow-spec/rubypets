import 'package:flutter/material.dart';

import 'package:rubypets_flutter/models/comment.dart';
import 'package:rubypets_flutter/models/post.dart';

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
    final likeIcon = post.isLiked ? Icons.favorite : Icons.favorite_border;
    final likeColor = post.isLiked ? Colors.redAccent : null;
    final content = post.body ?? '';

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
                        post.displayName,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        _formatTime(post.createdAt),
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
            if (content.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(content),
            ],
            if (post.originPostId != null) ...[
              const SizedBox(height: 12),
              _OriginCard(post: post.originPost),
            ],
            if (post.mediaUrls.isNotEmpty) ...[
              const SizedBox(height: 12),
              _MediaGrid(post: post),
            ],
            if (post.latestComment != null) ...[
              const SizedBox(height: 8),
              _LatestCommentPreview(comment: post.latestComment!),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _ActionButton(
                  icon: likeIcon,
                  iconColor: likeColor,
                  label: post.likeCount.toString(),
                  onPressed: onLike,
                ),
                _ActionButton(
                  icon: Icons.chat_bubble_outline,
                  label: post.commentCount.toString(),
                  onPressed: onComment,
                ),
                _ActionButton(
                  icon: Icons.repeat,
                  label: post.repostCount.toString(),
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
    this.iconColor,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final Color? iconColor;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: onPressed,
      icon: Icon(icon, color: iconColor),
      label: Text(label),
    );
  }
}

class _OriginCard extends StatelessWidget {
  const _OriginCard({required this.post});

  final FeedPost? post;

  @override
  Widget build(BuildContext context) {
    if (post == null || post!.isDeleted == 1) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Text('Original post deleted'),
      );
    }

    final content = post!.body ?? '';
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            post!.displayName,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          if (content.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(content),
          ],
        ],
      ),
    );
  }
}

class _MediaGrid extends StatelessWidget {
  const _MediaGrid({required this.post});

  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    if (post.postType == 'video') {
      return Container(
        height: 180,
        decoration: BoxDecoration(
          color: Colors.black12,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(child: Icon(Icons.play_circle_outline, size: 48)),
      );
    }

    if (post.mediaUrls.length == 1) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Image.network(
          post.mediaUrls.first,
          height: 200,
          width: double.infinity,
          fit: BoxFit.cover,
        ),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: post.mediaUrls.length,
      itemBuilder: (context, index) {
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            post.mediaUrls[index],
            fit: BoxFit.cover,
          ),
        );
      },
    );
  }
}

class _LatestCommentPreview extends StatelessWidget {
  const _LatestCommentPreview({required this.comment});

  final FeedComment comment;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(Icons.chat_bubble_outline, size: 16, color: colorScheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            '${comment.displayName}: ${comment.content}',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

String _formatTime(String iso) {
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return iso;
  final now = DateTime.now();
  final diff = now.difference(parsed.toLocal());
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  return '${diff.inDays}d';
}
