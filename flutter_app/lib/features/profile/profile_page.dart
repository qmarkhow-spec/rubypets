import 'package:flutter/material.dart';

import 'debug_page.dart';
import 'login_page.dart';
import 'register_page.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    const owner = _mockOwner;
    final colorScheme = Theme.of(context).colorScheme;

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
                    backgroundColor: colorScheme.primaryContainer,
                    child: Text(
                      owner.initials,
                      style: TextStyle(
                        fontSize: 20,
                        color: colorScheme.onPrimaryContainer,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          owner.displayName,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          owner.bio,
                          style: TextStyle(
                            color: colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 12,
                          children: [
                            _StatPill(label: '追蹤中', value: owner.following.toString()),
                            _StatPill(label: '追蹤者', value: owner.followers.toString()),
                            _StatPill(label: '寵物', value: owner.pets.toString()),
                          ],
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.edit_outlined),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('個人資料編輯待開發')),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text('快捷功能', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.login),
                  title: const Text('登入'),
                  subtitle: const Text('已放在個人區，暫時用於測試'),
                  onTap: () => _openPage(context, const LoginPage()),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.app_registration),
                  title: const Text('註冊'),
                  subtitle: const Text('建立新飼主帳戶'),
                  onTap: () => _openPage(context, const RegisterPage()),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.bug_report_outlined),
                  title: const Text('Debug 工具'),
                  subtitle: const Text('暫時集中在個人區'),
                  onTap: () => _openPage(context, const DebugPage()),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Text('我的寵物', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...owner.petsList.map(
            (pet) => ListTile(
              leading: const Icon(Icons.pets),
              title: Text(pet.name),
              subtitle: Text('${pet.species} · ${pet.age}'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('${pet.name} 的專區待開發')),
                );
              },
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

class OwnerProfile {
  const OwnerProfile({
    required this.displayName,
    required this.bio,
    required this.followers,
    required this.following,
    required this.pets,
    required this.petsList,
  });

  final String displayName;
  final String bio;
  final int followers;
  final int following;
  final int pets;
  final List<PetProfile> petsList;

  String get initials {
    final parts = displayName.split(' ');
    if (parts.length >= 2) {
      final first = parts.first.isNotEmpty ? parts.first[0] : '';
      final last = parts.last.isNotEmpty ? parts.last[0] : '';
      return (first + last).toUpperCase();
    }
    return displayName.isNotEmpty
        ? displayName.substring(0, displayName.length >= 2 ? 2 : 1).toUpperCase()
        : 'R';
  }
}

class PetProfile {
  const PetProfile({
    required this.name,
    required this.species,
    required this.age,
  });

  final String name;
  final String species;
  final String age;
}

const _mockOwner = OwnerProfile(
  displayName: 'Demo Owner',
  bio: '愛狗也愛貓，分享日常與散步小路線。',
  followers: 1200,
  following: 321,
  pets: 2,
  petsList: [
    PetProfile(name: 'Mochi', species: 'Corgi', age: '3 歲'),
    PetProfile(name: 'Kiki', species: 'Cat', age: '1.5 歲'),
  ],
);

class _StatPill extends StatelessWidget {
  const _StatPill({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Chip(
      label: RichText(
        text: TextSpan(
          style: TextStyle(color: colorScheme.onSurface, fontSize: 13),
          children: [
            TextSpan(
              text: '$value ',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            TextSpan(text: label),
          ],
        ),
      ),
      backgroundColor: colorScheme.surfaceContainerHighest.withValues(alpha: 102),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }
}
