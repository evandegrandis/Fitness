import SwiftUI
import SwiftData
import UserNotifications

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @State private var selectedTab = 0
    @State private var hasSeeded = false
    @State private var workoutVM = WorkoutViewModel()

    var body: some View {
        TabView(selection: $selectedTab) {
            WorkoutTabView(viewModel: workoutVM)
                .tabItem {
                    Label("Séance", systemImage: "figure.strengthtraining.traditional")
                }
                .tag(0)

            ProgressTabView()
                .tabItem {
                    Label("Progrès", systemImage: "chart.bar.fill")
                }
                .tag(1)

            HistoryTabView()
                .tabItem {
                    Label("Historique", systemImage: "clock.arrow.circlepath")
                }
                .tag(2)
        }
        .tint(Color.accentColor)
        .toolbarBackground(.hidden, for: .tabBar)
        .onAppear {
            // Tab bar appearance — transparent with a subtle top border so it
            // feels lifted from the content, not a heavy slab. The gradient
            // BackgroundGradient shows through for a more ambient look.
            let tabAppearance = UITabBarAppearance()
            tabAppearance.configureWithTransparentBackground()
            tabAppearance.backgroundColor = UIColor(red: 0.10, green: 0.11, blue: 0.17, alpha: 0.72)
            tabAppearance.shadowColor = UIColor.white.withAlphaComponent(0.06)

            let itemAppearance = UITabBarItemAppearance()
            itemAppearance.normal.iconColor = UIColor.white.withAlphaComponent(0.45)
            itemAppearance.normal.titleTextAttributes = [
                .foregroundColor: UIColor.white.withAlphaComponent(0.45),
                .font: UIFont.systemFont(ofSize: 10, weight: .medium)
            ]
            tabAppearance.stackedLayoutAppearance = itemAppearance
            tabAppearance.inlineLayoutAppearance = itemAppearance
            tabAppearance.compactInlineLayoutAppearance = itemAppearance

            UITabBar.appearance().standardAppearance = tabAppearance
            UITabBar.appearance().scrollEdgeAppearance = tabAppearance

            workoutVM.modelContext = modelContext
            workoutVM.loadActiveSession()
            seedIfNeeded()

            // Load settings defaults
            let descriptor = FetchDescriptor<UserSettings>()
            if let settings = try? modelContext.fetch(descriptor).first {
                workoutVM.defaultRestSeconds = settings.defaultRestTimerSeconds
                workoutVM.supersetRestSeconds = settings.supersetRestSeconds
            }

            // Request notification permission for rest timer T-3 wake.
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
    }

    private func seedIfNeeded() {
        let descriptor = FetchDescriptor<Exercise>()
        let count = (try? modelContext.fetch(descriptor).count) ?? 0
        guard count == 0 else { return }
        SeedData.seed(context: modelContext)
    }
}
