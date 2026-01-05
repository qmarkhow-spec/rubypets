import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/comment.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';

final commentsProvider = FutureProvider.autoDispose.family<List<FeedComment>, String>((ref, postId) async {
  // This provider fetches the comments for a specific post ID.
  // The '.family' modifier allows us to pass in the postId.
  // '.autoDispose' will cache the comments but clear them when the sheet is closed.

  final apiClient = ref.watch(apiClientProvider);

  // We don't need to watch the session here, as the comment sheet should only be
  // accessible when logged in anyway. The check will be in the UI.

  final result = await apiClient.listComments(postId: postId, limit: 20);
  return result.items;
});
