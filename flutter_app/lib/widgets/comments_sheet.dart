import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    this.highlightCommentId,
    this.autoOpenKeyboard = false,
  });

  final FeedPost post;
  final void Function(FeedComment comment, int? commentCount) onCommentPosted;
  final String? highlightCommentId;
  final bool autoOpenKeyboard;

  @override
  ConsumerState<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<CommentsSheet> {
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _inputFocusNode = FocusNode();
  final Map<String, GlobalKey> _keyMap = {};

  FeedComment? _replyTarget;
  bool _submitting = false;
  String? _highlightId;
  bool _initialScrolled = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _inputFocusNode.dispose();
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
      ref.invalidate(commentsProvider(widget.post.id));
      ref.invalidate(feedProvider);
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
      ref.invalidate(commentsProvider(widget.post.id));
    } catch (err) {
      _showSnack(_readError(err));
    }
  }

  void _setHighlight(String? id) {
    if (id == null || id.isEmpty) return;
    setState(() => _highlightId = id);
  }

  void _scrollToKey(GlobalKey key, {double offset = 0}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = key.currentContext;
      if (ctx == null) return;
      Scrollable.ensureVisible(
        ctx,
        alignment: 0.02,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
      if (offset > 0) {
        final current = _scrollController.position.pixels;
        final next = (current - offset).clamp(0.0, _scrollController.position.maxScrollExtent.toDouble());
        _scrollController.animateTo(
          next,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _requestKeyboardFocus() {
    if (!mounted) return;
    FocusScope.of(context).unfocus();
    FocusScope.of(context).requestFocus(_inputFocusNode);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      FocusScope.of(context).requestFocus(_inputFocusNode);
      SystemChannels.textInput.invokeMethod('TextInput.show');
    });
  }

  void _focusReply(FeedComment target) {
    setState(() => _replyTarget = target);
    _requestKeyboardFocus();
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _handlePop() async {
    if (_replyTarget != null) {
      setState(() => _replyTarget = null);
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.9;
    final commentsState = ref.watch(commentsProvider(widget.post.id));
    final sessionState = ref.watch(sessionProvider);
    final viewInsets = MediaQuery.of(context).viewInsets;
    final highlightId = widget.highlightCommentId ?? '';

    return WillPopScope(
      onWillPop: _handlePop,
      child: SafeArea(
        child: AnimatedPadding(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          padding: EdgeInsets.only(bottom: viewInsets.bottom),
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
                              child: Builder(
                                builder: (context) {
                                  for (final entry in comments) {
                                    _keyMap.putIfAbsent(entry.id, () => GlobalKey());
                                    for (final reply in entry.replies) {
                                      _keyMap.putIfAbsent(reply.id, () => GlobalKey());
                                    }
                                  }
                                  if (!_initialScrolled && highlightId.isNotEmpty) {
                                    final key = _keyMap[highlightId];
                                    if (key != null) {
                                      _initialScrolled = true;
                                      WidgetsBinding.instance.addPostFrameCallback((_) {
                                        if (!mounted) return;
                                        _setHighlight(highlightId);
                                        Scrollable.ensureVisible(
                                          key.currentContext!,
                                          alignment: 1.0,
                                          duration: const Duration(milliseconds: 250),
                                          curve: Curves.easeOut,
                                        );
                                        if (widget.autoOpenKeyboard) {
                                          _requestKeyboardFocus();
                                        }
                                      });
                                    }
                                  }
                                  return ListView.builder(
                                    controller: _scrollController,
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    itemCount: comments.length,
                                    itemBuilder: (context, index) {
                                      final comment = comments[index];
                                      return _CommentTile(
                                        key: _keyMap[comment.id],
                                        comment: comment,
                                        highlightId: _highlightId,
                                        onReply: () => _focusReply(comment),
                                        onLike: () => _toggleCommentLike(comment),
                                        onReplyToReply: (reply) => _focusReply(reply),
                                        onLikeReply: (reply) => _toggleCommentLike(reply),
                                      );
                                    },
                                  );
                                },
                              ),
                            ),
                    ),
                  ),
                if (sessionState.valueOrNull != null)
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_replyTarget != null)
                        _ReplyBanner(
                          target: _replyTarget!,
                          onClear: () => setState(() => _replyTarget = null),
                        ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _controller,
                                focusNode: _inputFocusNode,
                                decoration: const InputDecoration(
                                  hintText: 'Write a comment',
                                ),
                                minLines: 1,
                                maxLines: 4,
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
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({
    super.key,
    required this.comment,
    required this.highlightId,
    required this.onReply,
    required this.onLike,
    required this.onReplyToReply,
    required this.onLikeReply,
  });

  final FeedComment comment;
  final String? highlightId;
  final VoidCallback onReply;
  final VoidCallback onLike;
  final void Function(FeedComment reply) onReplyToReply;
  final void Function(FeedComment reply) onLikeReply;

  @override
  Widget build(BuildContext context) {
    final timeLabel = _formatTime(comment.createdAt);
    final isHighlighted = highlightId == comment.id;
    final highlightColor = Theme.of(context).colorScheme.primaryContainer.withOpacity(0.55);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 1000),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: isHighlighted ? highlightColor : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
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
              ],
            ),
          ),
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
                        highlightId: highlightId,
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
    required this.highlightId,
    required this.onReply,
    required this.onLike,
  });

  final FeedComment reply;
  final String? highlightId;
  final VoidCallback onReply;
  final VoidCallback onLike;

  @override
  Widget build(BuildContext context) {
    final timeLabel = _formatTime(reply.createdAt);
    final isHighlighted = highlightId == reply.id;
    final highlightColor = Theme.of(context).colorScheme.primaryContainer.withOpacity(0.55);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 1000),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: isHighlighted ? highlightColor : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
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
              ],
            ),
          ),
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

class _ReplyBanner extends StatelessWidget {
  const _ReplyBanner({
    required this.target,
    required this.onClear,
  });

  final FeedComment target;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '正在回覆 ${target.displayName}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
          IconButton(
            onPressed: onClear,
            icon: const Icon(Icons.close, size: 18),
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


