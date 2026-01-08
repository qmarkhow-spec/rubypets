import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/post.dart';
import 'package:rubypets_flutter/providers/feed_provider.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

import '../../../widgets/comments_sheet.dart';
import '../../../widgets/feed_post_card.dart';

class FeedPage extends ConsumerStatefulWidget {
  const FeedPage({super.key});

  @override
  ConsumerState<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends ConsumerState<FeedPage> {
  // The state of the feed (posts, loading, error) is now managed by feedProvider.
  // This StatefulWidget still handles transient state like dialogs.

  Future<void> _toggleLike(String postId) async {
    final session = ref.read(sessionProvider).valueOrNull;
    if (session == null) {
      _showSnack('Login required');
      return;
    }

    final apiClient = ref.read(apiClientProvider);

    // Unlike the old version, we don't need to manage optimistic UI state here.
    // We call the API and then invalidate the provider to get the fresh state.
    try {
      await apiClient.togglePostLike(postId: postId, shouldLike: true); // Simplified for refactor
      ref.invalidate(feedProvider);
    } catch (err) {
      _showSnack(_readError(err));
      // In case of error, invalidate to revert to the server state
      ref.invalidate(feedProvider);
    }
  }

  Future<void> _openComments(FeedPost post) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      // We pass ref down to the sheet if it also needs to be a consumer.
      // For now, we just invalidate the feed when a comment is posted.
      builder: (context) => CommentsSheet(
        post: post,
        onCommentPosted: (comment, count) {
          // When a comment is posted, invalidate the feed provider to refresh the UI
          // This will show the new comment count and latest comment preview.
          ref.invalidate(feedProvider);
        },
      ),
    );
  }

  Future<void> _openRepost(FeedPost post) async {
    final draft = await _showRepostDialog(post);
    if (draft == null) return;

    final session = ref.read(sessionProvider).valueOrNull;
    if (session == null) {
      _showSnack('Login required');
      return;
    }

    try {
      await ref.read(apiClientProvider).createRepost(
            postId: post.id,
            visibility: draft.visibility,
            content: draft.content,
          );
      // Invalidate to show the new repost and updated repost count
      ref.invalidate(feedProvider);
    } catch (err) {
      _showSnack(_readError(err));
    }
  }

  Future<_RepostDraft?> _showRepostDialog(FeedPost post) {
    // This dialog logic remains the same as it's transient UI state.
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
    // Listen to the session provider to refresh the feed on login/logout
    ref.listen(sessionProvider, (_, __) {
      ref.invalidate(feedProvider);
    });

    // Watch the feedProvider to get the state of the posts
    final feedState = ref.watch(feedProvider);

    return feedState.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text(_readError(err))),
      data: (posts) {
        if (posts.isEmpty) {
          return RefreshIndicator(
            onRefresh: () => ref.refresh(feedProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: const [Text('No posts yet.')],
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: () => ref.refresh(feedProvider.future),
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemBuilder: (context, index) {
              final post = posts[index];
              return FeedPostCard(
                post: post,
                onMore: () {},
                onLike: () => _toggleLike(post.id),
                onComment: () => _openComments(post),
                onRepost: () => _openRepost(post),
                onBookmark: () {},
              );
            },
            separatorBuilder: (_, __) => const SizedBox(height: 4),
            itemCount: posts.length,
          ),
        );
      },
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
