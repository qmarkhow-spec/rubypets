class FeedPost {
  const FeedPost({
    required this.ownerDisplayName,
    required this.petDisplayName,
    required this.timeLabel,
    required this.content,
    this.mediaLabel,
    this.tags = const [],
    this.likes = 0,
    this.comments = 0,
    this.shares = 0,
    this.isLiked = false,
    this.latestComment,
  });

  final String ownerDisplayName;
  final String petDisplayName;
  final String timeLabel;
  final String content;
  final String? mediaLabel;
  final List<String> tags;
  final int likes;
  final int comments;
  final int shares;
  final bool isLiked;
  final String? latestComment;

  FeedPost copyWith({
    String? ownerDisplayName,
    String? petDisplayName,
    String? timeLabel,
    String? content,
    String? mediaLabel,
    List<String>? tags,
    int? likes,
    int? comments,
    int? shares,
    bool? isLiked,
    String? latestComment,
  }) {
    return FeedPost(
      ownerDisplayName: ownerDisplayName ?? this.ownerDisplayName,
      petDisplayName: petDisplayName ?? this.petDisplayName,
      timeLabel: timeLabel ?? this.timeLabel,
      content: content ?? this.content,
      mediaLabel: mediaLabel ?? this.mediaLabel,
      tags: tags ?? this.tags,
      likes: likes ?? this.likes,
      comments: comments ?? this.comments,
      shares: shares ?? this.shares,
      isLiked: isLiked ?? this.isLiked,
      latestComment: latestComment ?? this.latestComment,
    );
  }
}

const List<FeedPost> mockFeedPosts = [
  FeedPost(
    ownerDisplayName: 'Sophie',
    petDisplayName: 'Mochi the Corgi',
    timeLabel: '2h',
    content: '今天去公園跑了一圈，Mochi 終於學會了接飛盤！',
    mediaLabel: '圖片/影片預覽',
    tags: ['#corgi', '#park', '#frisbee'],
    likes: 128,
    comments: 16,
    shares: 5,
    latestComment: 'Ben：Mochi 太可愛了！',
  ),
  FeedPost(
    ownerDisplayName: 'Ben',
    petDisplayName: 'Luna the Shiba',
    timeLabel: '5h',
    content: '嘗試了自製鮭魚零食，Luna 超愛！食譜晚點補上～',
    tags: ['#shiba', '#homemade', '#snacks'],
    likes: 96,
    comments: 12,
    shares: 4,
    latestComment: 'Sophie：自製零食好厲害！',
  ),
  FeedPost(
    ownerDisplayName: 'Mia',
    petDisplayName: 'Kiki the Cat',
    timeLabel: '1d',
    content: '新買的逗貓棒大成功，Kiki 疲累直接睡爆沙發。',
    mediaLabel: '影片預覽',
    tags: ['#cat', '#playtime'],
    likes: 210,
    comments: 33,
    shares: 11,
    latestComment: 'Leo：這張太療癒了',
  ),
];
