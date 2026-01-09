import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/features/messages/room_page.dart';
import 'package:rubypets_flutter/models/chat.dart';
import 'package:rubypets_flutter/models/owner.dart';
import 'package:rubypets_flutter/models/user.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

class OwnerProfilePage extends ConsumerStatefulWidget {
  const OwnerProfilePage({super.key, required this.ownerId, this.ownerName});

  final String ownerId;
  final String? ownerName;

  @override
  ConsumerState<OwnerProfilePage> createState() => _OwnerProfilePageState();
}

class _OwnerProfilePageState extends ConsumerState<OwnerProfilePage> {
  OwnerDetail? _owner;
  FriendshipStatus _friendshipStatus = FriendshipStatus.none;
  bool _loading = true;
  bool _friendActionLoading = false;
  bool _messageLoading = false;
  String? _error;
  ProviderSubscription<AsyncValue<ApiUser?>>? _sessionSub;

  @override
  void initState() {
    super.initState();
    _loadOwner();
    _sessionSub = ref.listenManual<AsyncValue<ApiUser?>>(sessionProvider, (_, __) {
      _refreshFriendshipStatus();
    });
  }

  @override
  void dispose() {
    _sessionSub?.close();
    super.dispose();
  }

  Future<void> _loadOwner() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final owner = await api.fetchOwner(ownerId: widget.ownerId);
      setState(() {
        _owner = owner;
      });
      await _refreshFriendshipStatus();
    } catch (err) {
      setState(() {
        _error = 'Failed to load owner: $err';
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _refreshFriendshipStatus() async {
    final session = ref.read(sessionProvider).value;
    if (session == null || session.id == widget.ownerId) {
      if (mounted) {
        setState(() {
          _friendshipStatus = FriendshipStatus.none;
        });
      }
      return;
    }

    try {
      final api = ref.read(apiClientProvider);
      final status = await api.fetchFriendshipStatus(ownerId: widget.ownerId);
      if (mounted) {
        setState(() {
          _friendshipStatus = status;
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _error = 'Failed to load friendship status: $err';
        });
      }
    }
  }

  Future<void> _runFriendAction(Future<FriendshipStatus> Function() action) async {
    setState(() {
      _friendActionLoading = true;
    });
    try {
      final status = await action();
      if (mounted) {
        setState(() {
          _friendshipStatus = status;
        });
      }
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Friend action failed: $err')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _friendActionLoading = false;
        });
      }
    }
  }

  Future<String?> _promptFirstMessage() async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Send first message'),
          content: TextField(
            controller: controller,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'Say hello...',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(controller.text.trim()),
              child: const Text('Send'),
            ),
          ],
        );
      },
    );
    return result?.trim().isEmpty == true ? null : result;
  }

  Future<void> _openChat() async {
    final session = ref.read(sessionProvider).value;
    if (session == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sign in to send messages.')),
      );
      return;
    }

    setState(() {
      _messageLoading = true;
    });
    try {
      final api = ref.read(apiClientProvider);
      try {
        final thread = await api.createChatThread(otherOwnerId: widget.ownerId);
        _navigateToThread(thread);
      } on ApiException catch (err) {
        if (err.status != 400) rethrow;
        final firstMessage = await _promptFirstMessage();
        if (firstMessage == null || firstMessage.isEmpty) return;
        final thread = await api.createChatThread(
          otherOwnerId: widget.ownerId,
          firstMessageText: firstMessage,
        );
        _navigateToThread(thread);
      }
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Unable to open chat: $err')),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _messageLoading = false;
        });
      }
    }
  }

  void _navigateToThread(ChatThread thread) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ChatRoomPage(
          threadId: thread.threadId,
          threadTitle: thread.otherOwner.displayName,
          initialThread: thread,
        ),
      ),
    );
  }

  Future<bool> _confirmAction(String message) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm'),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    return confirmed == true;
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider).value;
    final isSelf = session?.id == widget.ownerId;
    final ownerName = widget.ownerName ?? _owner?.displayName ?? 'Owner Profile';

    return Scaffold(
      appBar: AppBar(title: Text(ownerName)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : _owner == null
                  ? const Center(child: Text('Owner not found.'))
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 32,
                                    backgroundImage: _owner!.avatarUrl == null
                                        ? null
                                        : NetworkImage(_owner!.avatarUrl!),
                                    child: _owner!.avatarUrl == null
                                        ? Text(
                                            _initials(_owner!.displayName),
                                            style: const TextStyle(fontWeight: FontWeight.w700),
                                          )
                                        : null,
                                  ),
                                  const SizedBox(width: 16),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _owner!.displayName,
                                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _owner!.locationLabel.isEmpty
                                              ? 'Location not set'
                                              : _owner!.locationLabel,
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (!isSelf) ...[
                            Row(
                              children: [
                                _buildFriendButton(),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: FilledButton.icon(
                                    onPressed: _messageLoading ? null : _openChat,
                                    icon: const Icon(Icons.chat_bubble_outline),
                                    label: Text(_messageLoading ? 'Opening...' : 'Send message'),
                                  ),
                                ),
                              ],
                            ),
                            if (session == null)
                              const Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(
                                  'Sign in to manage friendship or chat.',
                                  style: TextStyle(fontSize: 12),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
    );
  }

  Widget _buildFriendButton() {
    final session = ref.read(sessionProvider).value;
    if (session == null) {
      return const Expanded(
        child: OutlinedButton(
          onPressed: null,
          child: Text('Friends'),
        ),
      );
    }

    switch (_friendshipStatus) {
      case FriendshipStatus.pendingIncoming:
        return Expanded(
          child: Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: _friendActionLoading
                      ? null
                      : () async {
                          final confirmed = await _confirmAction('Accept friend request?');
                          if (!confirmed) return;
                          await _runFriendAction(() => ref
                              .read(apiClientProvider)
                              .acceptFriendRequest(ownerId: widget.ownerId));
                        },
                  child: const Text('Accept'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton(
                  onPressed: _friendActionLoading
                      ? null
                      : () async {
                          final confirmed = await _confirmAction('Reject friend request?');
                          if (!confirmed) return;
                          await _runFriendAction(() => ref
                              .read(apiClientProvider)
                              .rejectFriendRequest(ownerId: widget.ownerId));
                        },
                  child: const Text('Reject'),
                ),
              ),
            ],
          ),
        );
      case FriendshipStatus.pendingOutgoing:
        return Expanded(
          child: OutlinedButton(
            onPressed: _friendActionLoading
                ? null
                : () async {
                    final confirmed = await _confirmAction('Cancel friend request?');
                    if (!confirmed) return;
                    await _runFriendAction(() => ref
                        .read(apiClientProvider)
                        .cancelFriendRequest(ownerId: widget.ownerId));
                  },
            child: Text(_friendActionLoading ? 'Working...' : 'Request sent'),
          ),
        );
      case FriendshipStatus.friends:
        return Expanded(
          child: OutlinedButton(
            onPressed: _friendActionLoading
                ? null
                : () async {
                    final confirmed = await _confirmAction('Remove friend?');
                    if (!confirmed) return;
                    await _runFriendAction(() => ref.read(apiClientProvider).unfriend(ownerId: widget.ownerId));
                  },
            child: Text(_friendActionLoading ? 'Working...' : 'Friends'),
          ),
        );
      case FriendshipStatus.none:
      default:
        return Expanded(
          child: FilledButton(
            onPressed: _friendActionLoading
                ? null
                : () async {
                    await _runFriendAction(
                      () => ref.read(apiClientProvider).sendFriendRequest(ownerId: widget.ownerId),
                    );
                  },
            child: Text(_friendActionLoading ? 'Working...' : 'Add friend'),
          ),
        );
    }
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
