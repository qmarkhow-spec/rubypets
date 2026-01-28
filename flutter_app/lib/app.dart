import 'package:flutter/material.dart';

import 'features/create_post/create_post_page.dart';
import 'features/explore/explore_page.dart';
import 'features/feed/feed_page.dart';
import 'features/messages/messages_page.dart';
import 'features/notifications/notifications_page.dart';
import 'features/profile/profile_page.dart';
import 'features/video/video_page.dart';
import 'services/notification_router.dart';
import 'theme/app_theme.dart';
import 'widgets/app_top_bar.dart';

class RubyPetsApp extends StatelessWidget {
  const RubyPetsApp({super.key});

  List<Widget> get _pages => const [
        FeedPage(),
        VideoPage(),
        NotificationsPage(),
        ExplorePage(),
        ProfilePage(),
      ];

  void _openCreatePost() {
    NotificationRouter.navigatorKey.currentState?.push(
      MaterialPageRoute(builder: (_) => const CreatePostPage()),
    );
  }

  void _openMessages() {
    NotificationRouter.navigatorKey.currentState?.push(
      MaterialPageRoute(builder: (_) => const MessagesPage()),
    );
  }

  void _jumpToFeed() {
    NotificationRouter.tabIndex.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RubyPets',
      debugShowCheckedModeBanner: false,
      navigatorKey: NotificationRouter.navigatorKey,
      theme: AppTheme.light,
      home: ValueListenableBuilder<int>(
        valueListenable: NotificationRouter.tabIndex,
        builder: (context, index, _) {
          return Scaffold(
            appBar: AppTopBar(
              onAddPost: _openCreatePost,
              onLogoTap: _jumpToFeed,
              onMessages: _openMessages,
            ),
            body: IndexedStack(
              index: index,
              children: _pages,
            ),
            bottomNavigationBar: NavigationBar(
              selectedIndex: index,
              onDestinationSelected: (value) {
                NotificationRouter.tabIndex.value = value;
              },
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.home_outlined),
                  selectedIcon: Icon(Icons.home),
                  label: 'Feed',
                ),
                NavigationDestination(
                  icon: Icon(Icons.play_circle_outline),
                  selectedIcon: Icon(Icons.play_circle),
                  label: 'Video',
                ),
                NavigationDestination(
                  icon: Icon(Icons.notifications_none),
                  selectedIcon: Icon(Icons.notifications),
                  label: 'Notifications',
                ),
                NavigationDestination(
                  icon: Icon(Icons.explore_outlined),
                  selectedIcon: Icon(Icons.explore),
                  label: 'Explore',
                ),
                NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Profile',
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
