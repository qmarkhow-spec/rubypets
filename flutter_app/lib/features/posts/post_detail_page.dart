import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/post.dart';
import '../../providers/session_provider.dart';
import '../../widgets/comments_sheet.dart';
import '../../widgets/feed_post_card.dart';

class PostDetailPage extends ConsumerStatefulWidget {
  const PostDetailPage({
    super.key,
    required this.postId,
    this.highlightCommentId,
    this.openComments = false,
  });

  final String postId;
  final String? highlightCommentId;
  final bool openComments;

  @override
  ConsumerState<PostDetailPage> createState() => _PostDetailPageState();
}

class _PostDetailPageState extends ConsumerState<PostDetailPage> {
  FeedPost? _post;
  String? _error;
  bool _loading = true;
  bool _didAutoOpenComments = false;

  @override
  void initState() {
    super.initState();
    _loadPost();
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
      _maybeAutoOpenComments();
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

  void _maybeAutoOpenComments() {
    if (_didAutoOpenComments) return;
    if (!widget.openComments && (widget.highlightCommentId == null || widget.highlightCommentId!.isEmpty)) return;
    if (_post == null) return;
    _didAutoOpenComments = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _openComments();
    });
  }

  Future<void> _openComments() async {
    if (_post == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CommentsSheet(
        post: _post!,
        highlightCommentId: widget.highlightCommentId,
        autoOpenKeyboard: false,
        onCommentPosted: (_, __) {},
      ),
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _maybeAutoOpenComments();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Post')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _post == null
                  ? const Center(child: Text('Post not found.'))
                  : RefreshIndicator(
                      onRefresh: _loadPost,
                      child: ListView(
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
                            onComment: _openComments,
                          ),
                        ],
                      ),
                    ),
    );
  }
}
