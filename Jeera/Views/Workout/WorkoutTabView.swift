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
                    VStack(spacing: 12) {
                        heroSummaryCard

                        if !snapshot.topMuscles.isEmpty || !snapshot.prHighlights.isEmpty || !snapshot.remainingMuscles.isEmpty {
                            sessionReadCard
                        }

                        GlassCard(padding: 14, cornerRadius: 22) {
                            VStack(alignment: .leading, spacing: 10) {
                                summarySectionHeader(
                                    title: "Récupération",
                                    subtitle: "Créatine, protéine et sommeil D-1 / D-2"
                                )
                                dayCard(title: "D-1", creatine: $creatineD1, protein: $proteinD1, sleep: $sleepD1)
                                dayCard(title: "D-2", creatine: $creatineD2, protein: $proteinD2, sleep: $sleepD2)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                    .padding(.bottom, 84)
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
                        .font(.subheadline.weight(.medium))
                    }
                }

                footerBar
            }
        }
    }

    private var heroSummaryCard: some View {
        GlassCard(padding: 16, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Bilan express")
                            .font(.title2.weight(.black))
                        Text("Clôture rapide et lecture claire de la séance.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }

                    Spacer(minLength: 8)
                    trendPill
                }

                HStack(spacing: 8) {
                    statTile("Durée", value: snapshot.duration, tint: .white)
                    statTile("Sets", value: "\(snapshot.setCount)", tint: .orange)
                    statTile("Exos", value: "\(snapshot.exerciseCount)", tint: .accentColor)
                    statTile("PR", value: "\(snapshot.prCount)", tint: .yellow)
                }
            }
        }
    }

    private var footerBar: some View {
        VStack(spacing: 0) {
            Button {
                persistRecoveryCheckins()
                onSave()
            } label: {
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.subheadline)
                        .opacity(0)
                    Text("Sauvegarder & fermer")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity, alignment: .center)
                    Image(systemName: "checkmark.circle.fill")
                        .font(.subheadline)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .padding(.horizontal, 16)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
    }

    private var sessionReadCard: some View {
        GlassCard(padding: 14, cornerRadius: 22) {
            VStack(alignment: .leading, spacing: 14) {
                summarySectionHeader(
                    title: "Lecture séance",
                    subtitle: "Avancée, manques et records utiles"
                )

                if !snapshot.topMuscles.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionMiniTitle("Avancée musculaire")
                        HStack(spacing: 8) {
                            ForEach(snapshot.topMuscles) { impact in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(impact.parent.shortName)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Text("+\(impact.sets)")
                                        .font(.title3.weight(.heavy).monospacedDigit())
                                        .foregroundStyle(.accent)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(11)
                                .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                }

                if !snapshot.remainingMuscles.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionMiniTitle("À finir de couvrir")
                        HStack(spacing: 8) {
                            ForEach(snapshot.remainingMuscles) { impact in
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(impact.parent.shortName)
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Text("\(impact.sets) restants")
                                        .font(.caption.weight(.bold).monospacedDigit())
                                        .foregroundStyle(.orange)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(11)
                                .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                }

                if !snapshot.prHighlights.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionMiniTitle("PR de séance")
                        VStack(spacing: 6) {
                            ForEach(snapshot.prHighlights) { highlight in
                                HStack(spacing: 8) {
                                    Image(systemName: "star.fill")
                                        .font(.caption2)
                                        .foregroundStyle(.yellow)
                                    Text(highlight.title)
                                        .font(.caption.weight(.semibold))
                                        .lineLimit(1)
                                    Spacer()
                                    Text(highlight.detail)
                                        .font(.caption.weight(.bold).monospacedDigit())
                                        .foregroundStyle(.yellow)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 10)
                                .background(Color.yellow.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                        }
                    }
                }
            }
        }
    }

    private func statTile(_ label: String, value: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.weight(.bold).monospacedDigit())
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var trendPill: some View {
        let label = snapshot.progressionSignal
        let lower = label.lowercased()
        let color: Color
        let symbol: String

        if lower.contains("haus") {
            color = .orange
            symbol = "waveform.path.ecg"
        } else if lower.contains("bais") {
            color = .red
            symbol = "arrow.down.right"
        } else {
            color = .blue
            symbol = "equal"
        }

        return HStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.caption2.weight(.bold))
            Text(label)
                .font(.caption.weight(.semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(color.opacity(0.12), in: Capsule())
    }

    private func dayCard(
        title: String,
        creatine: Binding<Bool>,
        protein: Binding<Bool>,
        sleep: Binding<Double>
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Spacer()
                Text(sleep.wrappedValue, format: .number.precision(.fractionLength(1))) + Text("h")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                compactToggle(title: "Créatine", icon: "bolt.fill", isOn: creatine)
                compactToggle(title: "Protéine", icon: "fork.knife", isOn: protein)
            }

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Sommeil")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    sleepGaugeLabel(for: sleep.wrappedValue)
                }

                Slider(value: sleep, in: 3...11, step: 0.5)
                    .tint(Color.accentColor)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func compactToggle(title: String, icon: String, isOn: Binding<Bool>) -> some View {
        Button {
            isOn.wrappedValue.toggle()
            HapticManager.selection()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isOn.wrappedValue ? .white : .secondary)
                    .frame(width: 18, height: 18)

                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(isOn.wrappedValue ? .white : .secondary)

                Spacer(minLength: 0)

                ZStack {
                    Capsule()
                        .fill(isOn.wrappedValue ? Color.accentColor.opacity(0.26) : Color.white.opacity(0.08))
                        .frame(width: 38, height: 22)
                    Circle()
                        .fill(.white)
                        .frame(width: 16, height: 16)
                        .offset(x: isOn.wrappedValue ? 8 : -8)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isOn.wrappedValue ? Color.accentColor.opacity(0.16) : Color.white.opacity(0.03))
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func summarySectionHeader(title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.subheadline.weight(.heavy))
            Text(subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func sectionMiniTitle(_ title: String) -> some View {
        Text(title)
            .font(.caption.weight(.heavy))
            .foregroundStyle(.secondary)
    }

    private func sleepGaugeLabel(for hours: Double) -> some View {
        let text: String
        let tint: Color

        if hours >= 8 {
            text = "haut"
            tint = .green
        } else if hours >= 6.5 {
            text = "ok"
            tint = .blue
        } else {
            text = "bas"
            tint = .orange
        }

        return Text(text)
            .font(.caption2.weight(.bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.12), in: Capsule())
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
