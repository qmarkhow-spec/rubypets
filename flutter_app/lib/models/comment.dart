class FeedComment {
  FeedComment({
    required this.id,
    required this.postId,
    required this.ownerId,
    required this.content,
    required this.createdAt,
    this.ownerDisplayName,
    this.parentCommentId,
    this.likeCount = 0,
    this.isLiked = false,
    this.replies = const [],
  });

  final String id;
  final String postId;
  final String ownerId;
  final String content;
  final String createdAt;
  final String? ownerDisplayName;
  final String? parentCommentId;
  final int likeCount;
  final bool isLiked;
  final List<FeedComment> replies;

  String get displayName => (ownerDisplayName?.isNotEmpty ?? false) ? ownerDisplayName! : ownerId;

  FeedComment copyWith({
    String? id,
    String? postId,
    String? ownerId,
    String? content,
    String? createdAt,
    String? ownerDisplayName,
    String? parentCommentId,
    int? likeCount,
    bool? isLiked,
    List<FeedComment>? replies,
  }) {
    return FeedComment(
      id: id ?? this.id,
      postId: postId ?? this.postId,
      ownerId: ownerId ?? this.ownerId,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      ownerDisplayName: ownerDisplayName ?? this.ownerDisplayName,
      parentCommentId: parentCommentId ?? this.parentCommentId,
      likeCount: likeCount ?? this.likeCount,
      isLiked: isLiked ?? this.isLiked,
      replies: replies ?? this.replies,
    );
  }

  factory FeedComment.fromJson(Map<String, dynamic> json) {
    final repliesRaw = json['replies'] as List<dynamic>? ?? [];
    return FeedComment(
      id: json['id']?.toString() ?? '',
      postId: json['postId']?.toString() ?? '',
      ownerId: json['ownerId']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
      ownerDisplayName: json['ownerDisplayName']?.toString(),
      parentCommentId: json['parentCommentId']?.toString(),
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      isLiked: json['isLiked'] == true,
      replies: repliesRaw
          .whereType<Map<String, dynamic>>()
          .map(FeedComment.fromJson)
          .toList(),
    );
  }
}
