import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/providers/user_search_provider.dart';

class ExplorePage extends ConsumerStatefulWidget {
  const ExplorePage({super.key});

  @override
  ConsumerState<ExplorePage> createState() => _ExplorePageState();
}

class _ExplorePageState extends ConsumerState<ExplorePage> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _submitSearch(String query) {
    // We update a local state variable, which will cause the widget to rebuild.
    // When it rebuilds, it will watch the userSearchProvider with the new query.
    setState(() {
      _query = query.trim();
    });
  }

  @override
  Widget build(BuildContext context) {
    final searchResults = ref.watch(userSearchProvider(_query));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: TextField(
            controller: _searchController,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: '搜尋使用者...',
            ),
            onSubmitted: _submitSearch,
          ),
        ),
        Expanded(
          child: searchResults.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stack) => Center(child: Text('Error: $error')),
            data: (users) {
              if (_query.isEmpty) {
                return const Center(
                  child: Text('輸入關鍵字以搜尋使用者。'),
                );
              }
              if (users.isEmpty) {
                return Center(
                  child: Text('找不到使用者 "$_query"'),
                );
              }
              return ListView.builder(
                itemCount: users.length,
                itemBuilder: (context, index) {
                  final user = users[index];
                  return ListTile(
                    leading: CircleAvatar(
                      child: Text(_initials(user.displayName)),
                    ),
                    title: Text(user.displayName),
                    subtitle: Text('@${user.handle}'),
                    onTap: () {
                      // TODO: Navigate to user profile page
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Tapped on ${user.displayName}')),
                      );
                    },
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}

String _initials(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'U';
  final parts = trimmed.split(' ');
  if (parts.length >= 2) {
    final first = parts.first.isNotEmpty ? parts.first[0] : '';
    final last = parts.last.isNotEmpty ? parts.last[0] : '';
    return (first + last).toUpperCase();
  }
  return trimmed.length >= 2 ? trimmed.substring(0, 2).toUpperCase() : trimmed.toUpperCase();
}
