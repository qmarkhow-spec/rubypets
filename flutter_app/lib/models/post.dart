import 'comment.dart';

class FeedPost {
  FeedPost({
    required this.id,
    required this.authorId,
    required this.createdAt,
    this.authorDisplayName,
    this.body,
    this.postType,
    this.visibility,
    this.mediaUrls = const [],
    this.likeCount = 0,
    this.commentCount = 0,
    this.repostCount = 0,
    this.isLiked = false,
    this.originPostId,
    this.originPost,
    this.latestComment,
    this.isDeleted = 0,
  });

  final String id;
  final String authorId;
  final String createdAt;
  final String? authorDisplayName;
  final String? body;
  final String? postType;
  final String? visibility;
  final List<String> mediaUrls;
  final int likeCount;
  final int commentCount;
  final int repostCount;
  final bool isLiked;
  final String? originPostId;
  final FeedPost? originPost;
  final FeedComment? latestComment;
  final int isDeleted;

  String get displayName => (authorDisplayName?.isNotEmpty ?? false) ? authorDisplayName! : authorId;

  FeedPost copyWith({
    String? id,
    String? authorId,
    String? createdAt,
    String? authorDisplayName,
    String? body,
    String? postType,
    String? visibility,
    List<String>? mediaUrls,
    int? likeCount,
    int? commentCount,
    int? repostCount,
    bool? isLiked,
    String? originPostId,
    FeedPost? originPost,
    FeedComment? latestComment,
    int? isDeleted,
  }) {
    return FeedPost(
      id: id ?? this.id,
      authorId: authorId ?? this.authorId,
      createdAt: createdAt ?? this.createdAt,
      authorDisplayName: authorDisplayName ?? this.authorDisplayName,
      body: body ?? this.body,
      postType: postType ?? this.postType,
      visibility: visibility ?? this.visibility,
      mediaUrls: mediaUrls ?? this.mediaUrls,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      repostCount: repostCount ?? this.repostCount,
      isLiked: isLiked ?? this.isLiked,
      originPostId: originPostId ?? this.originPostId,
      originPost: originPost ?? this.originPost,
      latestComment: latestComment ?? this.latestComment,
      isDeleted: isDeleted ?? this.isDeleted,
    );
  }

  factory FeedPost.fromJson(Map<String, dynamic> json) {
    final originRaw = json['originPost'];
    final originPost = originRaw is Map<String, dynamic> ? FeedPost.fromJson(originRaw) : null;
    final latestRaw = json['latestComment'];
    final latestComment = latestRaw is Map<String, dynamic> ? FeedComment.fromJson(latestRaw) : null;
    return FeedPost(
      id: json['id']?.toString() ?? '',
      authorId: json['authorId']?.toString() ?? '',
      createdAt: json['createdAt']?.toString() ?? DateTime.now().toIso8601String(),
      authorDisplayName: json['authorDisplayName']?.toString(),
      body: json['body']?.toString(),
      postType: json['postType']?.toString(),
      visibility: json['visibility']?.toString(),
      mediaUrls: (json['mediaUrls'] as List<dynamic>? ?? [])
          .map((item) => item.toString())
          .toList(),
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      repostCount: (json['repostCount'] as num?)?.toInt() ?? 0,
      isLiked: json['isLiked'] == true,
      originPostId: json['originPostId']?.toString(),
      originPost: originPost,
      latestComment: latestComment,
      isDeleted: (json['isDeleted'] as num?)?.toInt() ?? 0,
    );
  }
}
