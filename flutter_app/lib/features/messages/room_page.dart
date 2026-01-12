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
  Timer? _reconnectTimer;
  Timer? _pingTimer;
  bool _connecting = false;
  int _reconnectAttempts = 0;
  DateTime _lastPongAt = DateTime.now();

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
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
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
    if (_channel != null || _connecting) return;
    final api = ref.read(apiClientProvider);
    final token = api.token;
    if (token == null || token.isEmpty) {
      setState(() => _error = 'Missing auth token. Please sign in again.');
      return;
    }

    _connecting = true;
    final wsUrl = _buildWebSocketUrl(api.baseUrl, widget.threadId, token);
    final channel = WebSocketChannel.connect(Uri.parse(wsUrl));
    _channel = channel;
    _channelSub = channel.stream.listen(
      _handleSocketMessage,
      onError: _handleSocketError,
      onDone: _handleSocketDone,
    );
    _connecting = false;
    _reconnectAttempts = 0;
    _lastPongAt = DateTime.now();
    _startPing();
  }

  void _handleSocketError(Object err) {
    if (!mounted) return;
    _channelSub?.cancel();
    _channel = null;
    _stopPing();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Socket error: $err')),
    );
    _scheduleReconnect();
  }

  void _handleSocketDone() {
    if (!mounted) return;
    _channelSub?.cancel();
    _channel = null;
    _stopPing();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Chat disconnected. Reconnecting...')),
    );
    _scheduleReconnect();
  }

  void _scheduleReconnect() {
    if (!mounted) return;
    if (_reconnectTimer != null) return;
    if (_reconnectAttempts >= 3) return;
    _reconnectAttempts += 1;
    _reconnectTimer = Timer(Duration(seconds: 2 * _reconnectAttempts), () {
      _reconnectTimer = null;
      if (!mounted) return;
      _connectSocket();
    });
  }

  void _handleSocketMessage(dynamic payload) {
    final text = payload is String ? payload : utf8.decode(payload as List<int>);
    final decoded = _safeJson(text);
    if (decoded == null) return;
    _reconnectAttempts = 0;
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
    } else if (type == 'pong') {
      _lastPongAt = DateTime.now();
      return;
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
    try {
      _channel?.sink.add(jsonEncode({
        'type': 'read',
        'last_read_message_id': lastId,
      }));
    } catch (_) {
      _handleSocketError(Exception('Read update failed'));
    }
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
      _connectSocket();
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
    try {
      _channel?.sink.add(jsonEncode({'type': 'send', 'body_text': text}));
    } catch (err) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Send failed: $err')),
      );
      _handleSocketError(err);
      return;
    }
    _controller.clear();
  }

  Future<void> _sendRequestAction(String action) async {
    if (_actionLoading) return;
    if (_channel == null) {
      _connectSocket();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Chat not connected yet.')),
      );
      return;
    }
    setState(() => _actionLoading = true);
    try {
      _channel?.sink.add(jsonEncode({'type': action}));
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Action failed: $err')),
        );
      }
      _handleSocketError(err);
    }
    await Future<void>.delayed(const Duration(milliseconds: 250));
    if (mounted) setState(() => _actionLoading = false);
  }

  void _startPing() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_channel == null) return;
      final now = DateTime.now();
      if (now.difference(_lastPongAt).inSeconds > 40) {
        _channel?.sink.close();
        _handleSocketDone();
        return;
      }
      try {
        _channel?.sink.add(jsonEncode({'type': 'ping'}));
      } catch (err) {
        _handleSocketError(err);
      }
    });
  }

  void _stopPing() {
    _pingTimer?.cancel();
    _pingTimer = null;
  }

  List<_ChatListEntry> _buildMessageEntries() {
    final entries = <_ChatListEntry>[];
    DateTime? lastDate;
    for (final message in _messages) {
      final localTime = _toTaipei(message.createdAt);
      final dateKey = DateTime(localTime.year, localTime.month, localTime.day);
      if (lastDate == null || !_isSameDay(lastDate, dateKey)) {
        entries.add(_ChatListEntry.date(_formatChatDateLabel(localTime)));
        lastDate = dateKey;
      }
      entries.add(_ChatListEntry.message(message));
    }
    return entries;
  }

  @override
  Widget build(BuildContext context) {
    final entries = _buildMessageEntries();
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
                        itemCount: entries.length + (_loadingMore ? 1 : 0),
                        itemBuilder: (context, index) {
                          if (_loadingMore && index == 0) {
                            return const Padding(
                              padding: EdgeInsets.only(bottom: 12),
                              child: Center(child: CircularProgressIndicator()),
                            );
                          }
                          final adjustedIndex = _loadingMore ? index - 1 : index;
                          final entry = entries[adjustedIndex];
                          if (entry.isDate) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    entry.label ?? '',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }
                          final message = entry.message!;
                          final isMe = _isMe(message.senderId);
                          final bubbleColor = isMe
                              ? Theme.of(context).colorScheme.primaryContainer
                              : Theme.of(context).colorScheme.surfaceContainerHighest;
                          final showRead = isMe && _otherLastReadId == message.id;
                          final timeLabel = _formatChatTime(message.createdAt);
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
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment:
                                        isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
                                    children: [
                                      Text(timeLabel, style: const TextStyle(fontSize: 11)),
                                      if (showRead) ...[
                                        const SizedBox(width: 6),
                                        const Text('已讀', style: TextStyle(fontSize: 11)),
                                      ],
                                    ],
                                  ),
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

class _ChatListEntry {
  const _ChatListEntry.date(this.label) : message = null;
  const _ChatListEntry.message(this.message) : label = null;

  final ChatMessage? message;
  final String? label;

  bool get isDate => label != null;
}

DateTime _toTaipei(String raw) {
  final utc = _parseUtcTimestamp(raw);
  return utc.toUtc().add(const Duration(hours: 8));
}

DateTime _parseUtcTimestamp(String raw) {
  final normalized = raw.trim().replaceFirst(' ', 'T');
  final parsed = DateTime.tryParse(normalized);
  if (parsed == null) return DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  return DateTime.utc(
    parsed.year,
    parsed.month,
    parsed.day,
    parsed.hour,
    parsed.minute,
    parsed.second,
    parsed.millisecond,
    parsed.microsecond,
  );
}

bool _isSameDay(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

String _formatChatTime(String raw) {
  final local = _toTaipei(raw);
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$hour:$minute';
}

String _formatChatDateLabel(DateTime local) {
  final today = _toTaipei(DateTime.now().toUtc().toIso8601String());
  final todayKey = DateTime(today.year, today.month, today.day);
  final messageKey = DateTime(local.year, local.month, local.day);
  final yesterdayKey = todayKey.subtract(const Duration(days: 1));
  if (_isSameDay(messageKey, todayKey)) return '今日';
  if (_isSameDay(messageKey, yesterdayKey)) return '昨日';
  final weekday = _weekdayLabel(local.weekday);
  if (local.year == today.year) {
    return '${local.month}月${local.day}日 $weekday';
  }
  return '${local.year}年${local.month}月${local.day}日 $weekday';
}

String _weekdayLabel(int weekday) {
  switch (weekday) {
    case DateTime.monday:
      return '星期一';
    case DateTime.tuesday:
      return '星期二';
    case DateTime.wednesday:
      return '星期三';
    case DateTime.thursday:
      return '星期四';
    case DateTime.friday:
      return '星期五';
    case DateTime.saturday:
      return '星期六';
    case DateTime.sunday:
      return '星期日';
    default:
      return '';
  }
}
