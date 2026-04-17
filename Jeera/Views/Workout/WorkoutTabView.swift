import SwiftUI
import SwiftData

struct WorkoutTabView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ZStack {
                BackgroundGradient()

                if viewModel.activeSession != nil {
                    ActiveWorkoutView(viewModel: viewModel)
                } else {
                    QuickStartView(viewModel: viewModel)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.body)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .overlay(alignment: .bottom) {
                if let summary = viewModel.completedWorkoutSummary {
                    Text(summary)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 11)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.bottom, 20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                                withAnimation(.spring(response: 0.4)) {
                                    viewModel.completedWorkoutSummary = nil
                                }
                            }
                        }
                }
            }
            .animation(.spring(response: 0.4), value: viewModel.completedWorkoutSummary)
        }
    }
}

struct BackgroundGradient: View {
    var body: some View {
        ZStack {
            // Deep indigo base — lifted from pure black so cards float instead of stacking.
            LinearGradient(
                colors: [
                    Color(red: 0.13, green: 0.14, blue: 0.22),
                    Color(red: 0.09, green: 0.10, blue: 0.15)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Soft ambient glow near the top so the header area feels airy, not cramped.
            RadialGradient(
                colors: [
                    Color(red: 0.32, green: 0.33, blue: 0.55).opacity(0.28),
                    Color.clear
                ],
                center: UnitPoint(x: 0.5, y: 0.0),
                startRadius: 0,
                endRadius: 420
            )
            .blendMode(.plusLighter)
            .allowsHitTesting(false)
        }
        .ignoresSafeArea()
    }
}
