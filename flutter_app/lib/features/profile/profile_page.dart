import 'package:flutter/material.dart';

import 'package:rubypets_flutter/services/session_controller.dart';

import 'debug_page.dart';
import 'login_page.dart';
import 'register_page.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionController.instance;
    return AnimatedBuilder(
      animation: session,
      builder: (context, _) {
        final user = session.user;
        return SingleChildScrollView(
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
                        child: Text(
                          user == null ? 'G' : _initials(user.displayName),
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName ?? 'Guest',
                              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(height: 4),
                            Text(user?.email ?? 'Not logged in'),
                          ],
                        ),
                      ),
                      if (user != null)
                        IconButton(
                          icon: const Icon(Icons.logout),
                          onPressed: () async {
                            await session.logout();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Logged out')),
                              );
                            }
                          },
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Text('Actions', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.login),
                      title: const Text('Login'),
                      subtitle: const Text('Authenticate with your account'),
                      onTap: () => _openPage(context, const LoginPage()),
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.app_registration),
                      title: const Text('Register'),
                      subtitle: const Text('Create a new account'),
                      onTap: () => _openPage(context, const RegisterPage()),
                    ),
                    const Divider(height: 1),
                    ListTile(
                      leading: const Icon(Icons.bug_report_outlined),
                      title: const Text('Debug Tools'),
                      subtitle: const Text('Client-side helpers'),
                      onTap: () => _openPage(context, const DebugPage()),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _openPage(BuildContext context, Widget page) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(),
          body: page,
        ),
      ),
    );
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
