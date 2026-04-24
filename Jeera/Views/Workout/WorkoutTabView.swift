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
    @Query(sort: \RecoveryCheckin.date, order: .reverse) private var recoveryHistory: [RecoveryCheckin]
    let snapshot: WorkoutViewModel.FinishedWorkoutSnapshot
    var onSave: () -> Void

    @AppStorage("recovery_creatine_d1") private var creatineD1 = false
    @AppStorage("recovery_creatine_d2") private var creatineD2 = false
    @AppStorage("recovery_protein_d1") private var proteinD1 = false
    @AppStorage("recovery_protein_d2") private var proteinD2 = false
    @AppStorage("recovery_sleep_d1") private var sleepD1 = 7.0
    @AppStorage("recovery_sleep_d2") private var sleepD2 = 7.0
    @State private var loadedSuggestedDefaults = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: 10) {
                        compactSummaryRow

                        GlassCard(padding: 14, cornerRadius: 20) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Récupération")
                                    .font(.subheadline.weight(.semibold))
                                dayCard(title: "D-1", creatine: $creatineD1, protein: $proteinD1, sleep: $sleepD1)
                                dayCard(title: "D-2", creatine: $creatineD2, protein: $proteinD2, sleep: $sleepD2)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .padding(.bottom, 120)
                }
                .background(BackgroundGradient().ignoresSafeArea())
                .navigationTitle("Bilan séance")
                .navigationBarTitleDisplayMode(.inline)
                .onAppear {
                    hydrateSuggestedDefaults()
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Skip") {
                            persistRecoveryCheckins()
                            onSave()
                        }
                    }
                }

                footerBar
            }
        }
    }

    private var compactSummaryRow: some View {
        HStack(spacing: 8) {
            statTile("Durée", value: snapshot.duration)
            statTile("Sets", value: "\(snapshot.setCount)")
            statTile("Exos", value: "\(snapshot.exerciseCount)")
            statTile("PR", value: "\(snapshot.prCount)")
        }
    }

    private var footerBar: some View {
        VStack(spacing: 8) {
            Button {
                persistRecoveryCheckins()
                onSave()
            } label: {
                HStack {
                    Text("Save & close")
                        .font(.headline.weight(.semibold))
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .font(.headline)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
    }

    private func statTile(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.weight(.bold).monospacedDigit())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func dayCard(
        title: String,
        creatine: Binding<Bool>,
        protein: Binding<Bool>,
        sleep: Binding<Double>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(sleep.wrappedValue, format: .number.precision(.fractionLength(1))) +
                Text("h")
            }
            .font(.caption.monospacedDigit())
            HStack(spacing: 12) {
                compactToggle(title: "Créatine", isOn: creatine)
                compactToggle(title: "Protéine", isOn: protein)
            }

            HStack {
                Text("Sommeil")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Slider(value: sleep, in: 3...11, step: 0.5)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func compactToggle(title: String, isOn: Binding<Bool>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            Toggle(title, isOn: isOn)
                .labelsHidden()
                .toggleStyle(.switch)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func hydrateSuggestedDefaults() {
        guard !loadedSuggestedDefaults else { return }
        loadedSuggestedDefaults = true

        if let d1 = checkin(forDayOffset: -1) {
            creatineD1 = d1.tookCreatine
            proteinD1 = d1.proteinTargetMet
            sleepD1 = d1.sleepHours
        }

        if let d2 = checkin(forDayOffset: -2) {
            creatineD2 = d2.tookCreatine
            proteinD2 = d2.proteinTargetMet
            sleepD2 = d2.sleepHours
        } else if let fallback = recoveryHistory.first {
            creatineD2 = fallback.tookCreatine
            proteinD2 = fallback.proteinTargetMet
            sleepD2 = fallback.sleepHours
        }
    }

    private func checkin(forDayOffset offset: Int) -> RecoveryCheckin? {
        let calendar = Calendar.current
        guard let targetDate = calendar.date(byAdding: .day, value: offset, to: Date()) else { return nil }
        let dayStart = calendar.startOfDay(for: targetDate)
        return recoveryHistory.first { calendar.isDate($0.date, inSameDayAs: dayStart) }
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
