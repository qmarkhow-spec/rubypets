import 'package:flutter/material.dart';

import 'package:rubypets_flutter/models/comment.dart';
import 'package:rubypets_flutter/models/post.dart';
import 'package:rubypets_flutter/services/api_client.dart';
import 'package:rubypets_flutter/services/session_controller.dart';

class CommentsSheet extends StatefulWidget {
  const CommentsSheet({
    super.key,
    required this.post,
    required this.onCommentPosted,
  });

  final FeedPost post;
  final void Function(FeedComment comment, int? commentCount) onCommentPosted;

  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  final SessionController _session = SessionController.instance;
  final TextEditingController _controller = TextEditingController();
  final List<FeedComment> _threads = [];
  FeedComment? _replyTarget;
  String? _cursor;
  bool _hasMore = false;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadComments(reset: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadComments({required bool reset}) async {
    if (!_session.isLoggedIn) {
      setState(() {
        _loading = false;
        _error = 'Login required';
      });
      return;
    }
    if (reset) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final result = await _session.api.listComments(
        postId: widget.post.id,
        limit: 20,
        cursor: reset ? null : _cursor,
      );
      setState(() {
        if (reset) {
          _threads
            ..clear()
            ..addAll(result.items);
        } else {
          _threads.addAll(result.items);
        }
        _cursor = result.nextCursor;
        _hasMore = result.hasMore;
      });
    } catch (err) {
      setState(() => _error = _readError(err));
    } finally {
      if (reset && mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _sendComment() async {
    if (!_session.isLoggedIn) {
      _showSnack('Login required');
      return;
    }
    final text = _controller.text.trim();
    if (text.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    try {
      final result = await _session.api.createComment(
        postId: widget.post.id,
        content: text,
        replyToCommentId: _replyTarget?.id,
      );
      final comment = result.comment;
      setState(() {
        if (comment.parentCommentId == null) {
          _threads.insert(0, comment);
        } else {
          _threads.replaceRange(0, _threads.length, _insertReply(_threads, comment));
        }
        _replyTarget = null;
        _controller.clear();
      });
      widget.onCommentPosted(comment, result.commentCount);
    } catch (err) {
      _showSnack(_readError(err));
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  List<FeedComment> _insertReply(List<FeedComment> current, FeedComment reply) {
    return current.map((thread) {
      if (thread.id == reply.parentCommentId) {
        return thread.copyWith(replies: [...thread.replies, reply]);
      }
      return thread;
    }).toList();
  }

  void _setReplyTarget(FeedComment target) {
    setState(() => _replyTarget = target);
  }

  void _clearReplyTarget() {
    setState(() => _replyTarget = null);
  }

  Future<void> _toggleCommentLike(FeedComment comment) async {
    if (!_session.isLoggedIn) {
      _showSnack('Login required');
      return;
    }
    final wasLiked = comment.isLiked;
    final nextCount = (comment.likeCount + (wasLiked ? -1 : 1)).clamp(0, 1 << 31);
    setState(() {
      _threads.replaceRange(0, _threads.length, _updateComment(_threads, comment.id, (item) {
        return item.copyWith(isLiked: !wasLiked, likeCount: nextCount);
      }));
    });
    try {
      final result = await _session.api.toggleCommentLike(commentId: comment.id);
      if (!mounted) return;
      setState(() {
        _threads.replaceRange(0, _threads.length, _updateComment(_threads, comment.id, (item) {
          return item.copyWith(isLiked: result.isLiked, likeCount: result.likeCount);
        }));
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _threads.replaceRange(0, _threads.length, _updateComment(_threads, comment.id, (item) {
          return item.copyWith(isLiked: wasLiked, likeCount: comment.likeCount);
        }));
      });
      _showSnack(_readError(err));
    }
  }

  List<FeedComment> _updateComment(
    List<FeedComment> current,
    String id,
    FeedComment Function(FeedComment) updater,
  ) {
    return current.map((thread) {
      if (thread.id == id) {
        return updater(thread);
      }
      final replies = thread.replies.map((reply) {
        if (reply.id == id) return updater(reply);
        return reply;
      }).toList();
      return thread.copyWith(replies: replies);
    }).toList();
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.8;
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
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _threads.isEmpty
                      ? const Center(child: Text('No comments yet.'))
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _threads.length + (_hasMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (_hasMore && index == _threads.length) {
                              return TextButton(
                                onPressed: () => _loadComments(reset: false),
                                child: const Text('Load more'),
                              );
                            }
                            final comment = _threads[index];
                            return _CommentTile(
                              comment: comment,
                              onReply: () => _setReplyTarget(comment),
                              onLike: () => _toggleCommentLike(comment),
                              onReplyToReply: (reply) => _setReplyTarget(reply),
                              onLikeReply: (reply) => _toggleCommentLike(reply),
                            );
                          },
                        ),
            ),
            if (_replyTarget != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Row(
                  children: [
                    Expanded(child: Text('Replying to ${_replyTarget!.displayName}')),
                    IconButton(onPressed: _clearReplyTarget, icon: const Icon(Icons.close, size: 18)),
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
