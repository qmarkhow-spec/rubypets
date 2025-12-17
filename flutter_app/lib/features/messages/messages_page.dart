import 'package:flutter/material.dart';

import 'room_page.dart';

class MessagesPage extends StatelessWidget {
  const MessagesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('訊息')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _mockThreads.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, index) {
          final thread = _mockThreads[index];
          return ListTile(
            tileColor: Theme.of(context).colorScheme.surface,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            leading: CircleAvatar(
              child: Text(thread.initials),
            ),
            title: Text(
              thread.title,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(thread.lastMessage),
            trailing: Text(thread.timeLabel),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ChatRoomPage(threadTitle: thread.title),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class MessageThread {
  const MessageThread({
    required this.title,
    required this.lastMessage,
    required this.timeLabel,
  });

  final String title;
  final String lastMessage;
  final String timeLabel;

  String get initials {
    final parts = title.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return 'RP';
    if (parts.length == 1) return parts.first.substring(0, parts.first.length >= 2 ? 2 : 1).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }
}

const _mockThreads = <MessageThread>[
  MessageThread(title: 'Sophie', lastMessage: 'Mochi 今天超可愛～', timeLabel: '2m'),
  MessageThread(title: 'Ben', lastMessage: '晚點一起去公園？', timeLabel: '1h'),
  MessageThread(title: 'Mia', lastMessage: 'Kiki 又打翻水了...', timeLabel: '1d'),
];
