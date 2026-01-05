import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/post.dart';
import 'session_provider.dart';

// This provider is responsible for fetching the list of feed posts.
// It uses `FutureProvider.autoDispose` so that the feed is automatically
// re-fetched when the user leaves and comes back to the feed page.
final feedProvider = FutureProvider.autoDispose<List<FeedPost>>((ref) async {
  // Get the API client from its provider
  final apiClient = ref.watch(apiClientProvider);
  // Watch the session provider to react to login/logout events
  final session = ref.watch(sessionProvider);

  // Fetch the initial list of posts
  final posts = await apiClient.listPosts(limit: 20);

  // If the user is logged in, fetch additional details for each post
  if (session.valueOrNull != null) {
    final detailedPosts = await Future.wait(posts.map((post) async {
      try {
        final latestCommentResult = await apiClient.fetchLatestComment(postId: post.id);
        return post.copyWith(
          latestComment: latestCommentResult.comment,
          commentCount: latestCommentResult.commentCount,
        );
      } catch (_) {
        // If fetching details for one post fails, return the original post
        return post;
      }
    }));
    return detailedPosts;
  }

  // If not logged in, return the basic list
  return posts;
});
