import 'owner.dart';

class ChatThread {
  ChatThread({
    required this.threadId,
    required this.otherOwner,
    required this.requestState,
    this.requestSenderId,
    this.requestMessageId,
    this.lastMessageId,
    this.lastMessagePreview,
    this.lastActivityAt,
    this.unread = false,
    this.archived = false,
    this.deleted = false,
    this.isFriend = false,
  });

  final String threadId;
  final OwnerSummary otherOwner;
  final String requestState;
  final String? requestSenderId;
  final String? requestMessageId;
  final String? lastMessageId;
  final String? lastMessagePreview;
  final String? lastActivityAt;
  final bool unread;
  final bool archived;
  final bool deleted;
  final bool isFriend;

  ChatThread applyUpdate(ChatThreadUpdate update) {
    if (update.threadId != threadId) return this;
    return ChatThread(
      threadId: threadId,
      otherOwner: otherOwner,
      requestState: update.requestState ?? requestState,
      requestSenderId: update.requestSenderId ?? requestSenderId,
      requestMessageId: update.requestMessageId ?? requestMessageId,
      lastMessageId: update.lastMessageId ?? lastMessageId,
      lastMessagePreview: lastMessagePreview,
      lastActivityAt: update.lastActivityAt ?? lastActivityAt,
      unread: unread,
      archived: archived,
      deleted: deleted,
      isFriend: isFriend,
    );
  }

  factory ChatThread.fromJson(Map<String, dynamic> json) {
    final otherOwnerRaw = json['otherOwner'] ?? json['other_owner'];
    final otherOwnerMap = otherOwnerRaw is Map<String, dynamic> ? otherOwnerRaw : <String, dynamic>{};
    return ChatThread(
      threadId: (json['threadId'] ?? json['thread_id'] ?? json['id'])?.toString() ?? '',
      otherOwner: OwnerSummary.fromJson(otherOwnerMap),
      requestState: (json['requestState'] ?? json['request_state'])?.toString() ?? 'none',
      requestSenderId: (json['requestSenderId'] ?? json['request_sender_id'])?.toString(),
      requestMessageId: (json['requestMessageId'] ?? json['request_message_id'])?.toString(),
      lastMessageId: (json['lastMessageId'] ?? json['last_message_id'])?.toString(),
      lastMessagePreview: (json['lastMessagePreview'] ?? json['last_message_preview'])?.toString(),
      lastActivityAt: (json['lastActivityAt'] ?? json['last_activity_at'])?.toString(),
      unread: json['unread'] == true,
      archived: json['archived'] == true,
      deleted: json['deleted'] == true,
      isFriend: json['isFriend'] == true,
    );
  }
}

class ChatThreadUpdate {
  ChatThreadUpdate({
    required this.threadId,
    this.requestState,
    this.requestSenderId,
    this.requestMessageId,
    this.lastMessageId,
    this.lastActivityAt,
  });

  final String threadId;
  final String? requestState;
  final String? requestSenderId;
  final String? requestMessageId;
  final String? lastMessageId;
  final String? lastActivityAt;

  factory ChatThreadUpdate.fromJson(Map<String, dynamic> json) {
    return ChatThreadUpdate(
      threadId: (json['threadId'] ?? json['thread_id'] ?? json['id'])?.toString() ?? '',
      requestState: (json['requestState'] ?? json['request_state'])?.toString(),
      requestSenderId: (json['requestSenderId'] ?? json['request_sender_id'])?.toString(),
      requestMessageId: (json['requestMessageId'] ?? json['request_message_id'])?.toString(),
      lastMessageId: (json['lastMessageId'] ?? json['last_message_id'])?.toString(),
      lastActivityAt: (json['lastActivityAt'] ?? json['last_activity_at'])?.toString(),
    );
  }
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.threadId,
    required this.senderId,
    required this.bodyText,
    required this.createdAt,
  });

  final String id;
  final String threadId;
  final String senderId;
  final String bodyText;
  final String createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: (json['id'] ?? json['message_id'])?.toString() ?? '',
      threadId: (json['threadId'] ?? json['thread_id'])?.toString() ?? '',
      senderId: (json['senderId'] ?? json['sender_id'])?.toString() ?? '',
      bodyText: (json['bodyText'] ?? json['body_text'])?.toString() ?? '',
      createdAt: (json['createdAt'] ?? json['created_at'])?.toString() ?? '',
    );
  }
}

class ChatThreadsPage {
  ChatThreadsPage({required this.items, required this.nextCursor});

  final List<ChatThread> items;
  final String? nextCursor;
}

class ChatMessagesPage {
  ChatMessagesPage({required this.items, required this.nextCursor});

  final List<ChatMessage> items;
  final String? nextCursor;
}
