import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:rubypets_flutter/models/user.dart';
import 'package:rubypets_flutter/providers/session_provider.dart';

import 'debug_page.dart';
import 'login_page.dart';
import 'register_page.dart';

class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch the session provider to get the current state
    final sessionState = ref.watch(sessionProvider);

    return sessionState.when(
      // Data state: we have a user or null
      data: (user) => _buildProfileView(context, ref, user),
      // Error state
      error: (error, stackTrace) => Center(
        child: Text('Error loading profile: $error'),
      ),
      // Loading state
      loading: () => const Center(child: CircularProgressIndicator()),
    );
  }

  Widget _buildProfileView(BuildContext context, WidgetRef ref, ApiUser? user) {
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
                        // Use the notifier to call the logout method
                        await ref.read(sessionProvider.notifier).logout();
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
