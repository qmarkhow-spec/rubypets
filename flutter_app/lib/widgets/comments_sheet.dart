import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/comment.dart';
import 'package:rubypets_flutter/models/post.dart';
import 'package:rubypets_flutter/providers/comments_provider.dart';
import 'package:rubypets_flutter/providers/feed_provider.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

class CommentsSheet extends ConsumerStatefulWidget {
  const CommentsSheet({
    super.key,
    required this.post,
    required this.onCommentPosted,
  });

  final FeedPost post;
  final void Function(FeedComment comment, int? commentCount) onCommentPosted;

  @override
  ConsumerState<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<CommentsSheet> {
  final TextEditingController _controller = TextEditingController();
  FeedComment? _replyTarget;
  bool _submitting = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _sendComment() async {
    if (ref.read(sessionProvider).valueOrNull == null) {
      _showSnack('Login required');
      return;
    }
    final text = _controller.text.trim();
    if (text.isEmpty || _submitting) return;

    setState(() => _submitting = true);

    try {
      final result = await ref.read(apiClientProvider).createComment(
            postId: widget.post.id,
            content: text,
            replyToCommentId: _replyTarget?.id,
          );
      // Invalidate the provider for this post's comments to refresh the list
      ref.invalidate(commentsProvider(widget.post.id));
      // Also invalidate the main feed provider to update the comment count there
      ref.invalidate(feedProvider);

      // This callback might still be useful for optimistic updates in the feed page
      widget.onCommentPosted(result.comment, result.commentCount);

      setState(() {
        _replyTarget = null;
        _controller.clear();
      });
    } catch (err) {
      _showSnack(_readError(err));
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _toggleCommentLike(FeedComment comment) async {
    if (ref.read(sessionProvider).valueOrNull == null) {
      _showSnack('Login required');
      return;
    }

    try {
      await ref.read(apiClientProvider).toggleCommentLike(commentId: comment.id);
      // Invalidate to refresh the liked state
      ref.invalidate(commentsProvider(widget.post.id));
    } catch (err) {
      _showSnack(_readError(err));
    }
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.8;
    final commentsState = ref.watch(commentsProvider(widget.post.id));
    final sessionState = ref.watch(sessionProvider);

    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Comments',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            if (sessionState.valueOrNull == null)
              const Expanded(child: Center(child: Text('Login to see comments.'))),
            if (sessionState.valueOrNull != null)
              Expanded(
                child: commentsState.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (err, stack) => Center(child: Text(_readError(err))),
                  data: (comments) => comments.isEmpty
                      ? const Center(child: Text('No comments yet.'))
                      : RefreshIndicator(
                          onRefresh: () => ref.refresh(commentsProvider(widget.post.id).future),
                          child: ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: comments.length,
                            itemBuilder: (context, index) {
                              final comment = comments[index];
                              return _CommentTile(
                                comment: comment,
                                onReply: () => setState(() => _replyTarget = comment),
                                onLike: () => _toggleCommentLike(comment),
                                onReplyToReply: (reply) => setState(() => _replyTarget = reply),
                                onLikeReply: (reply) => _toggleCommentLike(reply),
                              );
                            },
                          ),
                        ),
                ),
              ),
            if (sessionState.valueOrNull != null) ...[
              if (_replyTarget != null)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  child: Row(
                    children: [
                      Expanded(child: Text('Replying to ${_replyTarget!.displayName}')),
                      IconButton(
                        onPressed: () => setState(() => _replyTarget = null),
                        icon: const Icon(Icons.close, size: 18),
                      ),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        decoration: const InputDecoration(
                          hintText: 'Write a comment',
                        ),
                        minLines: 1,
                        maxLines: 3,
                      ),
                    ),
                    const SizedBox(width: 8),
                    ElevatedButton(
                      onPressed: _submitting ? null : _sendComment,
                      child: _submitting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Send'),
                    ),
                  ],
                ),
              ),
            ]
          ],
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    required this.comment,
    required this.onReply,
    required this.onLike,
    required this.onReplyToReply,
    required this.onLikeReply,
  });

  final FeedComment comment;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final void Function(FeedComment reply) onReplyToReply;
  final void Function(FeedComment reply) onLikeReply;

  @override
  Widget build(BuildContext context) {
    final timeLabel = _formatTime(comment.createdAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                comment.displayName,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              Text(timeLabel, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          Text(comment.content),
          Row(
            children: [
              TextButton.icon(
                onPressed: onLike,
                icon: Icon(comment.isLiked ? Icons.favorite : Icons.favorite_border, size: 16),
                label: Text(comment.likeCount.toString()),
              ),
              TextButton(
                onPressed: onReply,
                child: const Text('Reply'),
              ),
            ],
          ),
          if (comment.replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 16),
              child: Column(
                children: comment.replies
                    .map(
                      (reply) => _ReplyTile(
                        reply: reply,
                        onReply: () => onReplyToReply(reply),
                        onLike: () => onLikeReply(reply),
                      ),
                    )
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}

class _ReplyTile extends StatelessWidget {
  const _ReplyTile({
    required this.reply,
    required this.onReply,
    required this.onLike,
  });

  final FeedComment reply;
  final VoidCallback onReply;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    final timeLabel = _formatTime(reply.createdAt);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                reply.displayName,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              Text(timeLabel, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 4),
          Text(reply.content),
          Row(
            children: [
              TextButton.icon(
                onPressed: onLike,
                icon: Icon(reply.isLiked ? Icons.favorite : Icons.favorite_border, size: 16),
                label: Text(reply.likeCount.toString()),
              ),
              TextButton(
                onPressed: onReply,
                child: const Text('Reply'),
              ),
            ],
          ),
        ],
      ),
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

String _readError(Object err) {
  if (err is ApiException) return err.message;
  return 'Request failed';
}
