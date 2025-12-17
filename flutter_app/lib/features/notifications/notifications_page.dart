import 'package:flutter/material.dart';

class NotificationsPage extends StatelessWidget {
  const NotificationsPage({super.key});

  @override
  Widget build(BuildContext context) {
    const items = _mockNotifications;
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemBuilder: (context, index) {
        final item = items[index];
        return ListTile(
          tileColor: Theme.of(context).colorScheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          leading: Icon(
            item.icon,
            color: Theme.of(context).colorScheme.primary,
          ),
          title: Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(item.subtitle),
          trailing: Text(item.time),
          onTap: () {},
        );
      },
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemCount: items.length,
    );
  }
}

class NotificationItem {
  const NotificationItem({
    required this.title,
    required this.subtitle,
    required this.time,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final String time;
  final IconData icon;
}

const _mockNotifications = [
  NotificationItem(
    title: 'Luna 新增了一則貼文',
    subtitle: '照片：Luna 在公園奔跑',
    time: '3m',
    icon: Icons.photo,
  ),
  NotificationItem(
    title: 'Ben 按讚了你的貼文',
    subtitle: '「今晚的宵夜饅頭」',
    time: '25m',
    icon: Icons.favorite,
  ),
  NotificationItem(
    title: '新的追蹤者',
    subtitle: 'Sophie 追蹤了你',
    time: '1h',
    icon: Icons.person_add_alt_1,
  ),
  NotificationItem(
    title: '系統通知',
    subtitle: '影片區即將上線，敬請期待！',
    time: '1d',
    icon: Icons.notifications_active_outlined,
  ),
];
