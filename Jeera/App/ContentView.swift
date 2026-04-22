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
            workoutVM.observeLiveActivityIntents()
            seedIfNeeded()

            // Load settings defaults
            let descriptor = FetchDescriptor<UserSettings>()
            if let settings = try? modelContext.fetch(descriptor).first {
                workoutVM.defaultRestSeconds = settings.defaultRestTimerSeconds
                workoutVM.supersetRestSeconds = settings.supersetRestSeconds
            }

            // Request notification permission for rest timer T-3 wake.
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
            scheduleReinstallReminderIfNeeded()
        }
    }

    private func seedIfNeeded() {
        let descriptor = FetchDescriptor<Exercise>()
        let count = (try? modelContext.fetch(descriptor).count) ?? 0
        guard count == 0 else { return }
        SeedData.seed(context: modelContext)
    }

    /// Free-signing reminder: nudge 6 days after install/open so you remember
    /// to re-install/re-sign before iOS revokes the app at ~7 days.
    private func scheduleReinstallReminderIfNeeded() {
        let defaults = UserDefaults.standard
        let anchorKey = "jeera_install_anchor_date"
        let scheduledKey = "jeera_install_reminder_scheduled_for_anchor"

        let anchorDate: Date = {
            if let existing = defaults.object(forKey: anchorKey) as? Date {
                return existing
            }
            let now = Date()
            defaults.set(now, forKey: anchorKey)
            return now
        }()

        // Only schedule once per install anchor. Re-scheduling on every app open
        // would keep pushing the reminder out and it might never fire.
        if defaults.bool(forKey: scheduledKey) { return }

        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["jeera_reinstall_reminder"])

        var comps = DateComponents()
        comps.day = 6
        guard let triggerDate = Calendar.current.date(byAdding: comps, to: anchorDate) else { return }

        let content = UNMutableNotificationContent()
        content.title = "Jeera — rappel signature"
        content.body = "6 jours passés. Pense à re-signer/réinstaller l'app bientôt."
        content.sound = .default

        let triggerComps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: triggerDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: triggerComps, repeats: false)
        let request = UNNotificationRequest(
            identifier: "jeera_reinstall_reminder",
            content: content,
            trigger: trigger
        )
        center.add(request)
        defaults.set(true, forKey: scheduledKey)
    }
}
