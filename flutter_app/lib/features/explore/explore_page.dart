import 'package:flutter/material.dart';

class ExplorePage extends StatelessWidget {
  const ExplorePage({super.key});

  @override
  Widget build(BuildContext context) {
    const cards = _exploreCards;
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 0.9,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: cards.length,
      itemBuilder: (context, index) {
        final card = cards[index];
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Center(
                    child: Icon(card.icon, size: 48),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                card.title,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 4),
              Text(card.subtitle, style: const TextStyle(fontSize: 13)),
            ],
          ),
        );
      },
    );
  }
}

class ExploreCard {
  const ExploreCard({
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final IconData icon;
}

const _exploreCards = [
  ExploreCard(
    title: '熱門主題',
    subtitle: '每日熱門標籤',
    icon: Icons.local_fire_department,
  ),
  ExploreCard(
    title: '附近寵物',
    subtitle: '探索鄰近的新朋友',
    icon: Icons.location_on_outlined,
  ),
  ExploreCard(
    title: '精選影片',
    subtitle: '熱門短片精選',
    icon: Icons.play_circle_outline,
  ),
  ExploreCard(
    title: '養寵技巧',
    subtitle: '短文指南與教學',
    icon: Icons.menu_book_outlined,
  ),
];
