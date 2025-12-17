import 'package:flutter/material.dart';

import 'models/feed_post.dart';
import 'widgets/feed_post_card.dart';

class FeedPage extends StatelessWidget {
  const FeedPage({
    super.key,
    this.posts = mockFeedPosts,
  });

  final List<FeedPost> posts;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, index) {
        final post = posts[index];
        return FeedPostCard(
          post: post,
          onMore: () {},
          onLike: () {},
          onComment: () {},
          onRepost: () {},
          onBookmark: () {},
        );
      },
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemCount: posts.length,
    );
  }
}
