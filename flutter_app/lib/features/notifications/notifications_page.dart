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
    title: 'Luna liked your post',
    subtitle: 'A moment ago',
    time: '3m',
    icon: Icons.photo,
  ),
  NotificationItem(
    title: 'Ben liked your comment',
    subtitle: 'Just now',
    time: '25m',
    icon: Icons.favorite,
  ),
  NotificationItem(
    title: 'New friend request',
    subtitle: 'Sophie sent you a request',
    time: '1h',
    icon: Icons.person_add_alt_1,
  ),
  NotificationItem(
    title: 'Daily summary',
    subtitle: 'Your pets gained new followers',
    time: '1d',
    icon: Icons.notifications_active_outlined,
  ),
];
