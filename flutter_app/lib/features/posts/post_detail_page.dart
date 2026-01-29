import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/comment.dart';
import '../../models/post.dart';
import '../../providers/comments_provider.dart';
import '../../providers/session_provider.dart';
import '../../widgets/feed_post_card.dart';

class PostDetailPage extends ConsumerStatefulWidget {
  const PostDetailPage({
    super.key,
    required this.postId,
    this.highlightCommentId,
  });

  final String postId;
  final String? highlightCommentId;

  @override
  ConsumerState<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends ConsumerState<PostDetailPage> {
  FeedPost? _post;
  String? _error;
  bool _loading = true;
  final ScrollController _scrollController = ScrollController();
  final Map<String, GlobalKey> _threadKeys = {};
  bool _scrolledToHighlight = false;

  @override
  void initState() {
    super.initState();
    _loadPost();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadPost() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final post = await api.getPostById(postId: widget.postId);
      if (!mounted) return;
      setState(() {
        _post = post;
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load post: $err';
      });
    } finally {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _ensureHighlightVisible(List<FeedComment> comments) {
    final targetId = widget.highlightCommentId ?? '';
    if (targetId.isEmpty || _scrolledToHighlight) return;

    String? threadId;
    for (final comment in comments) {
      if (comment.id == targetId) {
        threadId = comment.id;
        break;
      }
      if (comment.replies.any((reply) => reply.id == targetId)) {
        threadId = comment.id;
        break;
      }
    }
    if (threadId == null) return;
    final key = _threadKeys[threadId];
    if (key == null) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = key.currentContext;
      if (ctx == null) return;
      _scrolledToHighlight = true;
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 350),
        alignment: 0.1,
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final commentsState = ref.watch(commentsProvider(widget.postId));

    return Scaffold(
      appBar: AppBar(title: const Text('Post')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _post == null
                  ? const Center(child: Text('Post not found.'))
                  : RefreshIndicator(
                      onRefresh: () async {
                        await _loadPost();
                        await ref.refresh(commentsProvider(widget.postId).future);
                      },
                      child: ListView(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        children: [
                          FeedPostCard(
                            post: _post!,
                            onLike: () async {
                              if (ref.read(sessionProvider).valueOrNull == null) return;
                              try {
                                final api = ref.read(apiClientProvider);
                                final result = await api.togglePostLike(
                                  postId: _post!.id,
                                  shouldLike: !_post!.isLiked,
                                );
                                setState(() {
                                  _post = _post!.copyWith(
                                    isLiked: result.isLiked,
                                    likeCount: result.likeCount,
                                  );
                                });
                              } catch (_) {}
                            },
                            onComment: null,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Comments',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 12),
                          commentsState.when(
                            loading: () => const Center(child: CircularProgressIndicator()),
                            error: (err, _) => Text('Failed to load comments: $err'),
                            data: (comments) {
                              _threadKeys.clear();
                              for (final comment in comments) {
                                _threadKeys[comment.id] = GlobalKey();
                              }
                              _ensureHighlightVisible(comments);

                              if (comments.isEmpty) {
                                return const Text('No comments yet.');
                              }

                              return Column(
                                children: comments
                                    .map(
                                      (comment) => _CommentThread(
                                        key: _threadKeys[comment.id],
                                        comment: comment,
                                        highlightCommentId: widget.highlightCommentId,
                                      ),
                                    )
                                    .toList(),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
    );
  }
}

class _CommentThread extends StatelessWidget {
  const _CommentThread({
    super.key,
    required this.comment,
    required this.highlightCommentId,
  });

  final FeedComment comment;
  final String? highlightCommentId;

  bool get _isHighlighted {
    final targetId = highlightCommentId ?? '';
    if (targetId.isEmpty) return false;
    if (comment.id == targetId) return true;
    return comment.replies.any((reply) => reply.id == targetId);
  }

  @override
  Widget build(BuildContext context) {
    final highlight = _isHighlighted;
    final highlightColor = Theme.of(context).colorScheme.primaryContainer.withOpacity(0.5);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: highlight ? highlightColor : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: highlight ? Border.all(color: Theme.of(context).colorScheme.primary) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CommentRow(comment: comment),
          if (comment.replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 12, top: 8),
              child: Column(
                children: comment.replies
                    .map((reply) => _CommentRow(comment: reply, isReply: true))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}

class _CommentRow extends StatelessWidget {
  const _CommentRow({
    required this.comment,
    this.isReply = false,
  });

  final FeedComment comment;
  final bool isReply;

  @override
  Widget build(BuildContext context) {
    final timeLabel = _formatTime(comment.createdAt);
    return Padding(
      padding: EdgeInsets.only(bottom: isReply ? 8 : 6),
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
