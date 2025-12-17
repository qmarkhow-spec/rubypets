import 'package:flutter/material.dart';

import 'features/create_post/create_post_page.dart';
import 'features/explore/explore_page.dart';
import 'features/feed/feed_page.dart';
import 'features/messages/messages_page.dart';
import 'features/notifications/notifications_page.dart';
import 'features/profile/profile_page.dart';
import 'features/video/video_page.dart';
import 'theme/app_theme.dart';
import 'widgets/app_top_bar.dart';

class RubyPetsApp extends StatefulWidget {
  const RubyPetsApp({super.key});

  @override
  State<RubyPetsApp> createState() => _RubyPetsAppState();
}

class _RubyPetsAppState extends State<RubyPetsApp> {
  int _selectedIndex = 0;
  final _navigatorKey = GlobalKey<NavigatorState>();

  late final List<Widget> _pages = const [
    FeedPage(),
    VideoPage(),
    NotificationsPage(),
    ExplorePage(),
    ProfilePage(),
  ];

  void _openCreatePost() {
    _navigatorKey.currentState?.push(
      MaterialPageRoute(builder: (_) => const CreatePostPage()),
    );
  }

  void _openMessages() {
    _navigatorKey.currentState?.push(
      MaterialPageRoute(builder: (_) => const MessagesPage()),
    );
  }

  void _jumpToFeed() {
    setState(() => _selectedIndex = 0);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RubyPets',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      theme: AppTheme.light,
      home: Scaffold(
        appBar: AppTopBar(
          onAddPost: _openCreatePost,
          onLogoTap: _jumpToFeed,
          onMessages: _openMessages,
        ),
        body: IndexedStack(
          index: _selectedIndex,
          children: _pages,
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _selectedIndex,
          onDestinationSelected: (index) {
            setState(() => _selectedIndex = index);
          },
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home),
              label: '首頁',
            ),
            NavigationDestination(
              icon: Icon(Icons.play_circle_outline),
              selectedIcon: Icon(Icons.play_circle),
              label: '影片',
            ),
            NavigationDestination(
              icon: Icon(Icons.notifications_none),
              selectedIcon: Icon(Icons.notifications),
              label: '通知',
            ),
            NavigationDestination(
              icon: Icon(Icons.explore_outlined),
              selectedIcon: Icon(Icons.explore),
              label: '探索',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person),
              label: '個人',
            ),
          ],
        ),
      ),
    );
  }
}
