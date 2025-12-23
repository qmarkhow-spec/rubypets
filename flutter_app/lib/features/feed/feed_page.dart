import 'package:flutter/material.dart';

import 'models/feed_post.dart';
import 'widgets/feed_post_card.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key, this.initialPosts = mockFeedPosts});

  final List<FeedPost> initialPosts;

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  late List<FeedPost> posts;

  @override
  void initState() {
    super.initState();
    posts = widget.initialPosts;
  }

  void _toggleLike(int index) {
    final post = posts[index];
    final isLiked = !post.isLiked;
    final likeDelta = isLiked ? 1 : -1;
    setState(() {
      posts = List.of(posts)
        ..[index] = post.copyWith(isLiked: isLiked, likes: (post.likes + likeDelta).clamp(0, 1 << 31));
    });
  }

  void _addComment(int index, {String comment = "我：留言內容"}) {
    final post = posts[index];
    setState(() {
      posts = List.of(posts)
        ..[index] = post.copyWith(
          comments: post.comments + 1,
          latestComment: comment,
        );
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, index) {
        final post = posts[index];
        return FeedPostCard(
          post: post,
          onMore: () {},
          onLike: () => _toggleLike(index),
          onComment: () => _addComment(index, comment: "我：好可愛！"),
          onRepost: () {},
          onBookmark: () {},
        );
      },
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemCount: posts.length,
    );
  }
}
