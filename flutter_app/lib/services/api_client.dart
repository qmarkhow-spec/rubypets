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

class PostLikeResult {
  PostLikeResult({required this.isLiked, required this.likeCount});

  final bool isLiked;
  final int likeCount;
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
    final payload = _unwrapMap(await _request(
      '/api/auth/login',
      method: 'POST',
      body: {'email': email, 'password': password},
    ));
    final userJson = payload['user'] as Map<String, dynamic>?;
    if (userJson == null) {
      throw ApiException(500, {'error': 'Malformed login response'});
    }
    final user = ApiUser.fromJson(userJson);
    final token = payload['accessToken']?.toString() ?? '';
    if (token.isEmpty) {
      throw ApiException(500, {'error': 'Missing access token'});
    }
    return ApiLoginResult(user: user, accessToken: token);
  }

  Future<ApiUser> fetchMe() async {
    final payload = _unwrapMap(await _request('/api/me'));
    return ApiUser.fromJson(payload);
  }

  Future<List<FeedPost>> listPosts({int limit = 20}) async {
    final payload = _unwrapList(await _request('/api/posts?limit=$limit'));
    final items = payload.whereType<Map<String, dynamic>>().map(FeedPost.fromJson).toList();
    return items;
  }

  Future<FeedPost> createPost({required String content, required String visibility}) async {
    final payload = _unwrapMap(await _request(
      '/api/posts',
      method: 'POST',
      body: {
        'content': content,
        'visibility': visibility,
        'post_type': 'text',
      },
    ));
    return FeedPost.fromJson(payload);
  }

  Future<PostLikeResult> togglePostLike({required String postId, required bool shouldLike}) async {
    final payload = _unwrapMap(await _request(
      '/api/posts/$postId/like',
      method: shouldLike ? 'POST' : 'DELETE',
    ));
    return PostLikeResult(
      isLiked: payload['isLiked'] == true,
      likeCount: (payload['like_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<LatestCommentResult> fetchLatestComment({required String postId}) async {
    final payload = _unwrapMap(await _request('/api/posts/$postId/comments'));
    final commentRaw = payload['comment'];
    final comment = commentRaw is Map<String, dynamic> ? FeedComment.fromJson(commentRaw) : null;
    final count = (payload['comment_count'] as num?)?.toInt() ?? 0;
    return LatestCommentResult(comment: comment, commentCount: count);
  }

  Future<CommentListResult> listComments({required String postId, int limit = 20, String? cursor}) async {
    final query = cursor == null ? 'limit=$limit' : 'limit=$limit&cursor=$cursor';
    final payload = _unwrapMap(await _request('/api/posts/$postId/comments/list?$query'));
    final items = (payload['items'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(FeedComment.fromJson)
        .toList();
    return CommentListResult(
      items: items,
      nextCursor: payload['nextCursor']?.toString(),
      hasMore: payload['hasMore'] == true,
    );
  }

  Future<CommentCreateResult> createComment({
    required String postId,
    required String content,
    String? replyToCommentId,
  }) async {
    final body = <String, dynamic>{'content': content};
    if (replyToCommentId != null && replyToCommentId.isNotEmpty) {
      body['reply_to_comment_id'] = replyToCommentId;
    }
    final payload = _unwrapMap(await _request(
      '/api/posts/$postId/comments',
      method: 'POST',
      body: body,
    ));
    final comment = FeedComment.fromJson(payload['comment'] as Map<String, dynamic>);
    final count = (payload['comment_count'] as num?)?.toInt();
    return CommentCreateResult(comment: comment, commentCount: count);
  }

  Future<CommentLikeResult> toggleCommentLike({required String commentId}) async {
    final payload = _unwrapMap(await _request(
      '/api/comments/$commentId/like',
      method: 'POST',
    ));
    return CommentLikeResult(
      isLiked: payload['isLiked'] == true,
      likeCount: (payload['like_count'] as num?)?.toInt() ?? 0,
    );
  }

  Future<ApiRepostResult> createRepost({
    required String postId,
    required String visibility,
    String? content,
  }) async {
    final body = <String, dynamic>{'visibility': visibility};
    if (content != null) {
      body['content'] = content;
    }
    final payload = _unwrapMap(await _request(
      '/api/posts/$postId/repost',
      method: 'POST',
      body: body,
    ));
    final post = FeedPost.fromJson(payload['post'] as Map<String, dynamic>);
    final origin = payload['origin'] as Map<String, dynamic>?;
    final repostCount = (origin?['repost_count'] as num?)?.toInt() ?? 0;
    return ApiRepostResult(post: post, originRepostCount: repostCount);
  }

  Future<List<ApiUser>> searchUsers({required String query}) async {
    final encoded = Uri.encodeQueryComponent(query);
    final payload = _unwrapMap(await _request('/api/owners/search?display_name=$encoded'));
    final rawItems = payload['items'] as List<dynamic>? ?? [];
    final items = rawItems.whereType<Map<String, dynamic>>().map(ApiUser.fromJson).toList();
    return items;
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

  Map<String, dynamic> _unwrapMap(Object? raw) {
    if (raw is Map<String, dynamic>) {
      final data = raw['data'];
      if (data is Map<String, dynamic>) return data;
      return raw;
    }
    throw ApiException(500, {'error': 'Malformed response'});
  }

  List<dynamic> _unwrapList(Object? raw) {
    if (raw is Map<String, dynamic>) {
      final data = raw['data'];
      if (data is List<dynamic>) return data;
    } else if (raw is List<dynamic>) {
      return raw;
    }
    throw ApiException(500, {'error': 'Malformed response'});
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
