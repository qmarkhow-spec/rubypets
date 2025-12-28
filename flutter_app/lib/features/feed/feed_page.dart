import 'package:flutter/material.dart';

import 'package:rubypets_flutter/models/comment.dart';
import 'package:rubypets_flutter/models/post.dart';
import 'package:rubypets_flutter/services/api_client.dart';
import 'package:rubypets_flutter/services/session_controller.dart';

import 'widgets/comments_sheet.dart';
import 'widgets/feed_post_card.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final SessionController _session = SessionController.instance;
  final List<FeedPost> _posts = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _session.addListener(_onSessionChanged);
    _loadPosts();
  }

  @override
  void dispose() {
    _session.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    if (!_loading) {
      _loadPosts();
    }
  }

  Future<void> _loadPosts() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final fetched = await _session.api.listPosts(limit: 20);
      if (_session.isLoggedIn) {
        final latestResults = await Future.wait(
          fetched.map(
            (post) async {
              try {
                return await _session.api.fetchLatestComment(postId: post.id);
              } catch (_) {
                return null;
              }
            },
          ),
        );
        for (var i = 0; i < fetched.length; i++) {
          final latest = latestResults[i];
          if (latest == null) continue;
          fetched[i] = fetched[i].copyWith(
            latestComment: latest.comment,
            commentCount: latest.commentCount,
          );
        }
      }
      _posts
        ..clear()
        ..addAll(fetched);
    } catch (err) {
      _error = _readError(err);
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  int _indexForPost(String postId) {
    return _posts.indexWhere((post) => post.id == postId);
  }

  Future<void> _toggleLike(String postId) async {
    if (!_session.isLoggedIn) {
      _showSnack('Login required');
      return;
    }
    final index = _indexForPost(postId);
    if (index < 0) return;
    final post = _posts[index];
    final shouldLike = !post.isLiked;
    final delta = shouldLike ? 1 : -1;
    setState(() {
      _posts[index] = post.copyWith(
        isLiked: shouldLike,
        likeCount: (post.likeCount + delta).clamp(0, 1 << 31),
      );
    });
    try {
      final likeCount = await _session.api.togglePostLike(postId: postId, shouldLike: shouldLike);
      if (!mounted) return;
      final refreshedIndex = _indexForPost(postId);
      if (refreshedIndex < 0) return;
      setState(() {
        _posts[refreshedIndex] = _posts[refreshedIndex].copyWith(
          isLiked: shouldLike,
          likeCount: likeCount,
        );
      });
    } catch (err) {
      if (!mounted) return;
      final refreshedIndex = _indexForPost(postId);
      if (refreshedIndex >= 0) {
        setState(() => _posts[refreshedIndex] = post);
      }
      _showSnack(_readError(err));
    }
  }

  Future<void> _openComments(String postId) async {
    final index = _indexForPost(postId);
    if (index < 0) return;
    final post = _posts[index];
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => CommentsSheet(
        post: post,
        onCommentPosted: (comment, count) {
          _applyCommentUpdate(postId, comment, count);
        },
      ),
    );
  }

  void _applyCommentUpdate(String postId, FeedComment comment, int? commentCount) {
    final index = _indexForPost(postId);
    if (index < 0) return;
    final post = _posts[index];
    setState(() {
      _posts[index] = post.copyWith(
        commentCount: commentCount ?? (post.commentCount + 1),
        latestComment: comment,
      );
    });
  }

  Future<void> _openRepost(String postId) async {
    final index = _indexForPost(postId);
    if (index < 0) return;
    final post = _posts[index];
    final draft = await _showRepostDialog(post);
    if (draft == null) return;

    if (!_session.isLoggedIn) {
      _showSnack('Login required');
      return;
    }

    final content = draft.content?.trim();
    final optimisticId = 'optimistic-${DateTime.now().millisecondsSinceEpoch}';
    final user = _session.user;
    final optimistic = FeedPost(
      id: optimisticId,
      authorId: user?.id ?? 'me',
      authorDisplayName: user?.displayName,
      createdAt: DateTime.now().toIso8601String(),
      body: content != null && content.isNotEmpty ? content : null,
      postType: 'text',
      visibility: draft.visibility,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      isLiked: false,
      originPostId: post.id,
      originPost: post,
    );

    setState(() {
      _posts.insert(0, optimistic);
      final originIndex = _indexForPost(post.id);
      if (originIndex >= 0) {
        _posts[originIndex] = _posts[originIndex].copyWith(repostCount: post.repostCount + 1);
      }
    });

    try {
      final result = await _session.api.createRepost(
        postId: post.id,
        visibility: draft.visibility,
        content: content,
      );
      if (!mounted) return;
      setState(() {
        final optimisticIndex = _indexForPost(optimisticId);
        if (optimisticIndex >= 0) {
          _posts[optimisticIndex] = result.post;
        } else {
          _posts.insert(0, result.post);
        }
        final originIndex = _indexForPost(post.id);
        if (originIndex >= 0) {
          _posts[originIndex] = _posts[originIndex].copyWith(repostCount: result.originRepostCount);
        }
      });
    } catch (err) {
      if (!mounted) return;
      setState(() {
        _posts.removeWhere((item) => item.id == optimisticId);
        final originIndex = _indexForPost(post.id);
        if (originIndex >= 0) {
          final current = _posts[originIndex];
          _posts[originIndex] = current.copyWith(
            repostCount: (current.repostCount - 1).clamp(0, 1 << 31),
          );
        }
      });
      _showSnack(_readError(err));
    }
  }

  Future<_RepostDraft?> _showRepostDialog(FeedPost post) {
    final controller = TextEditingController();
    String visibility = 'public';
    return showDialog<_RepostDraft>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setState) => AlertDialog(
            title: const Text('Repost'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: controller,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    hintText: 'Add a note (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    const Text('Visibility'),
                    const SizedBox(width: 12),
                    DropdownButton<String>(
                      value: visibility,
                      items: const [
                        DropdownMenuItem(value: 'public', child: Text('public')),
                        DropdownMenuItem(value: 'friends', child: Text('friends')),
                        DropdownMenuItem(value: 'private', child: Text('private')),
                      ],
                      onChanged: (value) {
                        if (value == null) return;
                        setState(() => visibility = value);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _OriginPreview(post: post),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).pop(
                    _RepostDraft(content: controller.text, visibility: visibility),
                  );
                },
                child: const Text('Post'),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showSnack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_posts.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadPosts,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.redAccent))
            else
              const Text('No posts yet.'),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadPosts,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemBuilder: (context, index) {
          final hasError = _error != null;
          if (hasError && index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            );
          }
          final postIndex = hasError ? index - 1 : index;
          final post = _posts[postIndex];
          return FeedPostCard(
            post: post,
            onMore: () {},
            onLike: () => _toggleLike(post.id),
            onComment: () => _openComments(post.id),
            onRepost: () => _openRepost(post.id),
            onBookmark: () {},
          );
        },
        separatorBuilder: (_, __) => const SizedBox(height: 4),
        itemCount: _posts.length + (_error != null ? 1 : 0),
      ),
    );
  }
}

class _RepostDraft {
  _RepostDraft({required this.content, required this.visibility});

  final String? content;
  final String visibility;
}

class _OriginPreview extends StatelessWidget {
  const _OriginPreview({required this.post});

  final FeedPost post;

  @override
  Widget build(BuildContext context) {
    if (post.isDeleted == 1) {
      return const Align(
        alignment: Alignment.centerLeft,
        child: Text('Original post deleted'),
      );
    }
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
            post.displayName,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text(post.body ?? '(no content)'),
        ],
      ),
    );
  }
}

String _readError(Object err) {
  if (err is ApiException) return err.message;
  return 'Request failed';
}
