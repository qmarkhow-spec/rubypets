import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:rubypets_flutter/models/chat.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';
import 'package:rubypets_flutter/services/api_client.dart';

class ChatRoomPage extends ConsumerStatefulWidget {
  const ChatRoomPage({
    super.key,
    required this.threadId,
    required this.threadTitle,
    this.initialThread,
  });

  final String threadId;
  final String threadTitle;
  final ChatThread? initialThread;

  @override
  ConsumerState<ChatRoomPage> createState() => _ChatRoomPageState();
}

class _ChatRoomPageState extends ConsumerState<ChatRoomPage> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  WebSocketChannel? _channel;
  StreamSubscription? _channelSub;

  ChatThread? _thread;
  List<ChatMessage> _messages = [];
  String? _nextCursor;
  String? _error;
  bool _loading = true;
  bool _loadingMore = false;
  bool _actionLoading = false;
  String? _lastReadSent;
  String? _otherLastReadId;

  @override
  void initState() {
    super.initState();
    _loadThread();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _channelSub?.cancel();
    _channel?.sink.close();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadThread() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      final thread = widget.initialThread ?? await api.getChatThread(threadId: widget.threadId);
      final page = await api.listChatMessages(threadId: widget.threadId);
      final items = page.items;
      setState(() {
        _thread = thread;
        _messages = items;
        _nextCursor = page.nextCursor;
      });
      _connectSocket();
      _scrollToBottom();
    } catch (err) {
      setState(() {
        _error = 'Failed to load chat: $err';
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _nextCursor == null) return;
    setState(() => _loadingMore = true);
    try {
      final api = ref.read(apiClientProvider);
      final page = await api.listChatMessages(threadId: widget.threadId, before: _nextCursor);
      final items = page.items;
      setState(() {
        _messages = [...items, ..._messages];
        _nextCursor = page.nextCursor;
      });
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load older messages: $err')),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _connectSocket() {
    if (_channel != null) return;
    final api = ref.read(apiClientProvider);
    final token = api.token;
    if (token == null || token.isEmpty) {
      setState(() => _error = 'Missing auth token. Please sign in again.');
      return;
    }

    final wsUrl = _buildWebSocketUrl(api.baseUrl, widget.threadId, token);
    _channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _channelSub = _channel!.stream.listen(
      _handleSocketMessage,
      onError: (err) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Socket error: $err')),
        );
      },
    );
  }

  void _handleSocketMessage(dynamic payload) {
    final text = payload is String ? payload : utf8.decode(payload as List<int>);
    final decoded = _safeJson(text);
    if (decoded == null) return;
    final type = decoded['type']?.toString();
    if (type == 'message_new') {
      final raw = decoded['message'];
      if (raw is! Map<String, dynamic>) return;
      final message = ChatMessage.fromJson(raw);
      if (_messages.any((m) => m.id == message.id)) return;
      final shouldScroll = _isAtBottom() || _isMe(message.senderId);
      setState(() {
        _messages = [..._messages, message];
      });
      if (shouldScroll) {
        _scrollToBottom();
      }
      _sendReadIfNeeded();
    } else if (type == 'thread_updated') {
      final raw = decoded['thread'];
      if (raw is! Map<String, dynamic>) return;
      final update = ChatThreadUpdate.fromJson(raw);
      setState(() {
        _thread = _thread?.applyUpdate(update);
      });
    } else if (type == 'read_updated') {
      final ownerId = decoded['owner_id']?.toString();
      if (ownerId != null && !_isMe(ownerId)) {
        setState(() {
          _otherLastReadId = decoded['last_read_message_id']?.toString();
        });
      }
    } else if (type == 'error') {
      final message = decoded['message']?.toString() ?? 'Unknown error';
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Map<String, dynamic>? _safeJson(String raw) {
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  void _handleScroll() {
    if (_scrollController.position.pixels <= 60 && _nextCursor != null) {
      _loadMore();
    }
    _sendReadIfNeeded();
  }

  void _sendReadIfNeeded() {
    if (!_isAtBottom()) return;
    if (_messages.isEmpty) return;
    final lastId = _messages.last.id;
    if (lastId == _lastReadSent) return;
    _lastReadSent = lastId;
    _channel?.sink.add(jsonEncode({
      'type': 'read',
      'last_read_message_id': lastId,
    }));
  }

  bool _isAtBottom() {
    if (!_scrollController.hasClients) return true;
    final maxScroll = _scrollController.position.maxScrollExtent;
    return _scrollController.offset >= (maxScroll - 48);
  }

  bool _isMe(String senderId) {
    final session = ref.read(sessionProvider).value;
    return session != null && session.id == senderId;
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      _sendReadIfNeeded();
    });
  }

  bool get _isPending => _thread?.requestState == 'pending';
  bool get _isRejected => _thread?.requestState == 'rejected';
  bool get _isRequestSender => _thread?.requestSenderId == ref.read(sessionProvider).value?.id;

  bool get _canSend {
    if (_isRejected) return false;
    if (_isPending) {
      return _isRequestSender && (_thread?.requestMessageId == null);
    }
    return true;
  }

  void _sendMessage() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    if (_channel == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chat not connected yet.')),
      );
      return;
    }
    if (!_canSend) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Messaging is not available.')),
      );
      return;
    }
    _channel?.sink.add(jsonEncode({'type': 'send', 'body_text': text}));
    _controller.clear();
  }

  Future<void> _sendRequestAction(String action) async {
    if (_actionLoading) return;
    if (_channel == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chat not connected yet.')),
      );
      return;
    }
    setState(() => _actionLoading = true);
    _channel?.sink.add(jsonEncode({'type': action}));
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (mounted) setState(() => _actionLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.threadTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : Column(
                  children: [
                    if (_isPending && !_isRequestSender)
                      _RequestBanner(
                        loading: _actionLoading,
                        onAccept: () => _sendRequestAction('accept_request'),
                        onReject: () => _sendRequestAction('reject_request'),
                      )
                    else if (_isPending && _isRequestSender)
                      const _StatusBanner(text: 'Waiting for the other person to accept.')
                    else if (_isRejected)
                      const _StatusBanner(text: 'Request rejected. Messaging disabled.'),
                    Expanded(
                      child: ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length + (_loadingMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (_loadingMore && index == 0) {
                            return const Padding(
                              padding: EdgeInsets.only(bottom: 12),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }
                          final adjustedIndex = _loadingMore ? index - 1 : index;
                          final message = _messages[adjustedIndex];
                          final isMe = _isMe(message.senderId);
                          final bubbleColor = isMe
                              ? Theme.of(context).colorScheme.primaryContainer
                              : Theme.of(context).colorScheme.surfaceContainerHighest;
                          final showRead = isMe && _otherLastReadId == message.id;
                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Column(
                              crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                              children: [
                                Container(
                                  margin: const EdgeInsets.only(bottom: 6),
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: bubbleColor,
                                    borderRadius: BorderRadius.circular(14),
                                  ),
                                  child: Text(message.bodyText),
                                ),
                                if (showRead)
                                  const Padding(
                                    padding: EdgeInsets.only(bottom: 8),
                                    child: Text('Read', style: TextStyle(fontSize: 11)),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                        child: Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _controller,
                                enabled: _canSend,
                                decoration: InputDecoration(
                                  hintText: _canSend ? 'Type a message...' : 'Messaging disabled',
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton.filled(
                              onPressed: _canSend ? _sendMessage : null,
                              icon: const Icon(Icons.send),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }
}

String _buildWebSocketUrl(String baseUrl, String threadId, String token) {
  final uri = Uri.parse(baseUrl);
  final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
  return uri
      .replace(
        scheme: scheme,
        path: '/api/ws/threads/$threadId',
        queryParameters: {'token': token},
      )
      .toString();
}

class _RequestBanner extends StatelessWidget {
  const _RequestBanner({
    required this.loading,
    required this.onAccept,
    required this.onReject,
  });

  final bool loading;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          const Expanded(child: Text('Message request')),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: loading ? null : onAccept,
            child: const Text('Accept'),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: loading ? null : onReject,
            child: const Text('Reject'),
          ),
        ],
      ),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      padding: const EdgeInsets.all(12),
      child: Text(text),
    );
  }
}
