import SwiftUI
import SwiftData

struct WorkoutTabView: View {
    @Bindable var viewModel: WorkoutViewModel
    @State private var showSettings = false
    @State private var showPostWorkoutSummary = false

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
            .sheet(isPresented: $showPostWorkoutSummary) {
                if let snapshot = viewModel.finishedWorkoutSnapshot {
                    PostWorkoutSummarySheet(snapshot: snapshot) {
                        viewModel.finishedWorkoutSnapshot = nil
                        viewModel.completedWorkoutSummary = nil
                        showPostWorkoutSummary = false
                    }
                }
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
                            if viewModel.finishedWorkoutSnapshot != nil {
                                showPostWorkoutSummary = true
                                return
                            }
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

private struct PostWorkoutSummarySheet: View {
    @Environment(\.modelContext) private var modelContext
    let snapshot: WorkoutViewModel.FinishedWorkoutSnapshot
    var onSave: () -> Void

    @AppStorage("recovery_creatine_d1") private var creatineD1 = false
    @AppStorage("recovery_creatine_d2") private var creatineD2 = false
    @AppStorage("recovery_protein_d1") private var proteinD1 = false
    @AppStorage("recovery_protein_d2") private var proteinD2 = false
    @AppStorage("recovery_sleep_d1") private var sleepD1 = 7.0
    @AppStorage("recovery_sleep_d2") private var sleepD2 = 7.0

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                GlassCard(padding: 14, cornerRadius: 16) {
                    HStack(spacing: 16) {
                        stat("Durée", snapshot.duration)
                        stat("Sets", "\(snapshot.setCount)")
                        stat("PR", "\(snapshot.prCount)")
                        stat("Signal", snapshot.progressionSignal)
                    }
                }

                GlassCard(padding: 14, cornerRadius: 16) {
                    VStack(spacing: 10) {
                        dayRow(title: "D-1", creatine: $creatineD1, protein: $proteinD1, sleep: $sleepD1)
                        Divider().background(.white.opacity(0.12))
                        dayRow(title: "D-2", creatine: $creatineD2, protein: $proteinD2, sleep: $sleepD2)
                    }
                }

                Spacer()

                Button {
                    persistRecoveryCheckins()
                    onSave()
                } label: {
                    Text("Save & close")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
            }
            .padding()
            .background(BackgroundGradient().ignoresSafeArea())
            .navigationTitle("Bilan séance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Skip") {
                        persistRecoveryCheckins()
                        onSave()
                    }
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.subheadline.weight(.semibold))
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func dayRow(
        title: String,
        creatine: Binding<Bool>,
        protein: Binding<Bool>,
        sleep: Binding<Double>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            HStack {
                Toggle("Créatine", isOn: creatine)
                Toggle("Protéine", isOn: protein)
            }
            HStack {
                Text("Sommeil")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Slider(value: sleep, in: 3...11, step: 0.5)
                Text("\(sleep.wrappedValue, specifier: "%.1fh")")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(width: 44, alignment: .trailing)
            }
        }
    }

    private func persistRecoveryCheckins() {
        persistCheckin(dayOffset: -1, creatine: creatineD1, protein: proteinD1, sleep: sleepD1)
        persistCheckin(dayOffset: -2, creatine: creatineD2, protein: proteinD2, sleep: sleepD2)
        try? modelContext.save()
    }

    private func persistCheckin(dayOffset: Int, creatine: Bool, protein: Bool, sleep: Double) {
        let calendar = Calendar.current
        guard let date = calendar.date(byAdding: .day, value: dayOffset, to: Date()) else { return }
        let dayStart = calendar.startOfDay(for: date)
        guard let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return }

        let descriptor = FetchDescriptor<RecoveryCheckin>(
            predicate: #Predicate { $0.date >= dayStart && $0.date < nextDay }
        )

        if let existing = try? modelContext.fetch(descriptor).first {
            existing.tookCreatine = creatine
            existing.proteinTargetMet = protein
            existing.sleepHours = sleep
        } else {
            let new = RecoveryCheckin(
                date: dayStart,
                tookCreatine: creatine,
                proteinTargetMet: protein,
                sleepHours: sleep
            )
            modelContext.insert(new)
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
