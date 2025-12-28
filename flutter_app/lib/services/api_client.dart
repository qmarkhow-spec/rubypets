import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/comment.dart';
import '../models/post.dart';
import '../models/user.dart';

class ApiException implements Exception {
  ApiException(this.status, this.details);

  final int status;
  final Object? details;

  String get message {
    if (details is Map && (details as Map).containsKey('error')) {
      return (details as Map)['error'].toString();
    }
    return 'HTTP $status';
  }

  @override
  String toString() => message;
}

class ApiLoginResult {
  ApiLoginResult({required this.user, required this.accessToken});

  final ApiUser user;
  final String accessToken;
}

class ApiRepostResult {
  ApiRepostResult({required this.post, required this.originRepostCount});

  final FeedPost post;
  final int originRepostCount;
}

class ApiClient {
  ApiClient({String? baseUrl})
      : _baseUrl = baseUrl ?? const String.fromEnvironment(
          'API_BASE',
          defaultValue: 'https://api.rubypets.com',
        );

  final String _baseUrl;
  String? _token;

  void setToken(String? token) {
    _token = token;
  }

  Future<ApiLoginResult> login({required String email, required String password}) async {
    final data = await _request(
      '/api/auth/login',
      method: 'POST',
      body: {'email': email, 'password': password},
    ) as Map<String, dynamic>;
    final user = ApiUser.fromJson(data['user'] as Map<String, dynamic>);
    final token = data['accessToken']?.toString() ?? '';
    if (token.isEmpty) {
      throw ApiException(500, {'error': 'Missing access token'});
    }
    return ApiLoginResult(user: user, accessToken: token);
  }

  Future<ApiUser> fetchMe() async {
    final data = await _request('/api/me') as Map<String, dynamic>;
    return ApiUser.fromJson(data);
  }

  Future<List<FeedPost>> listPosts({int limit = 20}) async {
    final data = await _request('/api/posts?limit=$limit') as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(FeedPost.fromJson)
        .toList();
    return items;
  }

  Future<FeedPost> createPost({required String content, required String visibility}) async {
    final data = await _request(
      '/api/posts',
      method: 'POST',
      body: {
        'content': content,
        'visibility': visibility,
        'post_type': 'text',
      },
    ) as Map<String, dynamic>;
    return FeedPost.fromJson(data);
  }

  Future<int> togglePostLike({required String postId, required bool shouldLike}) async {
    final data = await _request(
      '/api/posts/$postId/like',
      method: shouldLike ? 'POST' : 'DELETE',
    ) as Map<String, dynamic>;
    return (data['like_count'] as num?)?.toInt() ?? 0;
  }

  Future<LatestCommentResult> fetchLatestComment({required String postId}) async {
    final data = await _request('/api/posts/$postId/comments') as Map<String, dynamic>;
    final commentRaw = data['data'];
    final comment = commentRaw is Map<String, dynamic> ? FeedComment.fromJson(commentRaw) : null;
    final count = (data['comment_count'] as num?)?.toInt() ?? 0;
    return LatestCommentResult(comment: comment, commentCount: count);
  }

  Future<CommentListResult> listComments({required String postId, int limit = 20, String? cursor}) async {
    final query = cursor == null ? 'limit=$limit' : 'limit=$limit&cursor=$cursor';
    final data = await _request('/api/posts/$postId/comments/list?$query') as Map<String, dynamic>;
    final items = (data['data'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(FeedComment.fromJson)
        .toList();
    return CommentListResult(
      items: items,
      nextCursor: data['nextCursor']?.toString(),
      hasMore: data['hasMore'] == true,
    );
  }

  Future<CommentCreateResult> createComment({
    required String postId,
    required String content,
    String? replyToCommentId,
  }) async {
    final payload = <String, dynamic>{'content': content};
    if (replyToCommentId != null && replyToCommentId.isNotEmpty) {
      payload['reply_to_comment_id'] = replyToCommentId;
    }
    final data = await _request(
      '/api/posts/$postId/comments',
      method: 'POST',
      body: payload,
    ) as Map<String, dynamic>;
    final comment = FeedComment.fromJson(data['data'] as Map<String, dynamic>);
    final count = (data['comment_count'] as num?)?.toInt();
    return CommentCreateResult(comment: comment, commentCount: count);
  }

  Future<CommentLikeResult> toggleCommentLike({required String commentId}) async {
    final data = await _request(
      '/api/comments/$commentId/like',
      method: 'POST',
    ) as Map<String, dynamic>;
    return CommentLikeResult(
      isLiked: data['isLiked'] == true,
      likeCount: (data['like_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<ApiRepostResult> createRepost({
    required String postId,
    required String visibility,
    String? content,
  }) async {
    final payload = <String, dynamic>{'visibility': visibility};
    if (content != null) {
      payload['content'] = content;
    }
    final data = await _request(
      '/api/posts/$postId/repost',
      method: 'POST',
      body: payload,
    ) as Map<String, dynamic>;
    final post = FeedPost.fromJson(data['data'] as Map<String, dynamic>);
    final origin = data['origin'] as Map<String, dynamic>?;
    final repostCount = (origin?['repost_count'] as num?)?.toInt() ?? 0;
    return ApiRepostResult(post: post, originRepostCount: repostCount);
  }

  Future<Object?> _request(
    String path, {
    String method = 'GET',
    Map<String, String>? headers,
    Object? body,
  }) async {
    final uri = Uri.parse('$_baseUrl$path');
    final requestHeaders = <String, String>{};
    if (_token != null && _token!.isNotEmpty) {
      requestHeaders['authorization'] = 'Bearer $_token';
    }
    if (body != null) {
      requestHeaders['content-type'] = 'application/json';
    }
    if (headers != null) {
      requestHeaders.addAll(headers);
    }

    http.Response response;
    final payload = body == null ? null : jsonEncode(body);
    switch (method) {
      case 'POST':
        response = await http.post(uri, headers: requestHeaders, body: payload);
        break;
      case 'DELETE':
        response = await http.delete(uri, headers: requestHeaders, body: payload);
        break;
      case 'GET':
        response = await http.get(uri, headers: requestHeaders);
        break;
      default:
        final req = http.Request(method, uri);
        req.headers.addAll(requestHeaders);
        if (payload != null) {
          req.body = payload;
        }
        final streamed = await req.send();
        response = await http.Response.fromStream(streamed);
        break;
    }

    final text = response.body;
    final decoded = text.isEmpty ? null : jsonDecode(text);
    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, decoded);
    }
    return decoded;
  }
}

class LatestCommentResult {
  LatestCommentResult({required this.comment, required this.commentCount});

  final FeedComment? comment;
  final int commentCount;
}

class CommentListResult {
  CommentListResult({required this.items, required this.nextCursor, required this.hasMore});

  final List<FeedComment> items;
  final String? nextCursor;
  final bool hasMore;
}

class CommentCreateResult {
  CommentCreateResult({required this.comment, required this.commentCount});

  final FeedComment comment;
  final int? commentCount;
}

class CommentLikeResult {
  CommentLikeResult({required this.isLiked, required this.likeCount});

  final bool isLiked;
  final int likeCount;
}
