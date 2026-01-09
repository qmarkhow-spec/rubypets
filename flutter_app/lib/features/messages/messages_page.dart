import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/chat.dart';
import 'package:rubypets_flutter/models/user.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

import 'room_page.dart';

class MessagesPage extends ConsumerStatefulWidget {
  const MessagesPage({super.key});

  @override
  ConsumerState<MessagesPage> createState() => _MessagesPageState();
}

class _MessagesPageState extends ConsumerState<MessagesPage> {
  bool _loading = true;
  String? _error;
  List<ChatThread> _threads = [];
  String? _nextCursor;
  bool _loadingMore = false;
  ProviderSubscription<AsyncValue<ApiUser?>>? _sessionSub;

  @override
  void initState() {
    super.initState();
    _loadThreads();
    _sessionSub = ref.listenManual<AsyncValue<ApiUser?>>(sessionProvider, (_, next) {
      if (next.value != null) {
        _loadThreads();
      } else {
        setState(() {
          _threads = [];
          _nextCursor = null;
        });
      }
    });
  }

  @override
  void dispose() {
    _sessionSub?.close();
    super.dispose();
  }

  Future<void> _loadThreads({bool append = false}) async {
    final session = ref.read(sessionProvider).value;
    if (session == null) {
      setState(() {
        _threads = [];
        _loading = false;
      });
      return;
    }

    if (!append) {
      setState(() {
        _loading = true;
        _error = null;
      });
    } else {
      setState(() => _loadingMore = true);
    }

    try {
      final api = ref.read(apiClientProvider);
      final page = await api.listChatThreads(limit: 30, cursor: append ? _nextCursor : null);
      setState(() {
        _threads = append ? [..._threads, ...page.items] : page.items;
        _nextCursor = page.nextCursor;
      });
    } catch (err) {
      setState(() {
        _error = 'Failed to load threads: $err';
      });
    } finally {
      setState(() {
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Messages')),
      body: session.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Failed to load: $error')),
        data: (user) {
          if (user == null) {
            return const Center(child: Text('Sign in to view messages.'));
          }
          if (_loading) {
            return const Center(child: CircularProgressIndicator());
          }
          if (_error != null) {
            return Center(child: Text(_error!));
          }
          if (_threads.isEmpty) {
            return const Center(child: Text('No conversations yet.'));
          }

          return RefreshIndicator(
            onRefresh: () => _loadThreads(),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _threads.length + (_nextCursor != null ? 1 : 0),
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                if (index >= _threads.length) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Center(
                      child: TextButton(
                        onPressed: _loadingMore ? null : () => _loadThreads(append: true),
                        child: Text(_loadingMore ? 'Loading...' : 'Load more'),
                      ),
                    ),
                  );
                }

                final thread = _threads[index];
                final preview = thread.lastMessagePreview ??
                    (thread.requestState == 'pending' ? 'Message request' : 'Start chatting');
                final statusLabel = thread.requestState == 'pending'
                    ? 'Request'
                    : thread.requestState == 'rejected'
                        ? 'Rejected'
                        : null;
                return ListTile(
                  tileColor: Theme.of(context).colorScheme.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                  leading: CircleAvatar(
                    child: Text(_initials(thread.otherOwner.displayName)),
                  ),
                  title: Row(
                    children: [
                      Expanded(
                        child: Text(
                          thread.otherOwner.displayName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ),
                      if (statusLabel != null)
                        Container(
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            statusLabel,
                            style: const TextStyle(fontSize: 11),
                          ),
                        ),
                      if (thread.unread)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: Theme.of(context).colorScheme.primary,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  subtitle: Text(preview, maxLines: 1, overflow: TextOverflow.ellipsis),
                  trailing: Text(_formatTime(thread.lastActivityAt)),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChatRoomPage(
                          threadId: thread.threadId,
                          threadTitle: thread.otherOwner.displayName,
                          initialThread: thread,
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}

String _formatTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return '';
  final now = DateTime.now();
  final diff = now.difference(parsed);
  if (diff.inMinutes < 1) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  return '${parsed.month}/${parsed.day}';
}

String _initials(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return 'RP';
  final parts = trimmed.split(RegExp(r'\s+'));
  if (parts.length == 1) {
    return parts.first.substring(0, parts.first.length >= 2 ? 2 : 1).toUpperCase();
  }
  return (parts.first[0] + parts.last[0]).toUpperCase();
}
