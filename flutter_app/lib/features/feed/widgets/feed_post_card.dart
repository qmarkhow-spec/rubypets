import 'dart:async';

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
              _MediaCarousel(post: post),
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

class _MediaCarousel extends StatefulWidget {
  const _MediaCarousel({required this.post});

  final FeedPost post;

  @override
  State<_MediaCarousel> createState() => _MediaCarouselState();
}

class _MediaCarouselState extends State<_MediaCarousel> {
  late final PageController _controller;
  Timer? _hideTimer;
  int _index = 0;
  bool _showOverlay = true;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _scheduleHide();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _scheduleHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted) return;
      setState(() => _showOverlay = false);
    });
  }

  void _onPageChanged(int index) {
    setState(() {
      _index = index;
      _showOverlay = true;
    });
    _scheduleHide();
  }

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    final total = post.mediaUrls.length;
    final showIndicators = total > 1 && _showOverlay;

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

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              itemCount: total,
              onPageChanged: _onPageChanged,
              itemBuilder: (context, index) {
                return Image.network(
                  post.mediaUrls[index],
                  width: double.infinity,
                  fit: BoxFit.cover,
                );
              },
            ),
            if (showIndicators)
              Positioned(
                right: 8,
                top: 8,
                child: _Bubble(
                  child: Text(
                    '${_index + 1}/$total',
                    style: const TextStyle(fontSize: 12, color: Colors.white),
                  ),
                ),
              ),
            if (showIndicators)
              Positioned(
                left: 0,
                right: 0,
                bottom: 8,
                child: Center(
                  child: _Bubble(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: List.generate(
                        total,
                        (dotIndex) => Container(
                          margin: const EdgeInsets.symmetric(horizontal: 2),
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: dotIndex == _index ? Colors.white : Colors.white54,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
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

class _Bubble extends StatelessWidget {
  const _Bubble({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(12),
      ),
      child: child,
    );
  }
}
