import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/owner.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';

// This provider searches for users based on a query.
// The '.family' modifier allows us to pass in the search query.
// It will be triggered by the UI when the user submits a search term.
final userSearchProvider = FutureProvider.autoDispose.family<List<OwnerSummary>, String>((ref, query) async {
  final trimmed = query.trim().toLowerCase();
  // If the query is too short, return an empty list immediately without hitting the API.
  if (trimmed.length < 2) {
    return [];
  }

  // Get the API client and perform the search.
  final apiClient = ref.watch(apiClientProvider);
  return apiClient.searchOwners(query: trimmed);
});
