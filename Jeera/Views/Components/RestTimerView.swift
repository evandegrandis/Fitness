import SwiftUI
import Combine

@Observable
class RestTimerModel {
    var isRunning = false
    var elapsed: TimeInterval = 0
    var targetSeconds: Int = 120
    var isComplete = false
    private var timer: AnyCancellable?
    private var startDate: Date?

    var progress: Double {
        guard targetSeconds > 0 else { return 0 }
        return min(elapsed / Double(targetSeconds), 1)
    }

    var remainingFormatted: String {
        let remaining = max(0, Double(targetSeconds) - elapsed)
        let mins = Int(remaining) / 60
        let secs = Int(remaining) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var elapsedFormatted: String {
        let mins = Int(elapsed) / 60
        let secs = Int(elapsed) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    var isOvertime: Bool {
        elapsed >= Double(targetSeconds)
    }

    func start(seconds: Int? = nil) {
        if let s = seconds { targetSeconds = s }
        startDate = Date()
        elapsed = 0
        isRunning = true
        isComplete = false
        timer = Timer.publish(every: 0.1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, let start = self.startDate else { return }
                self.elapsed = Date().timeIntervalSince(start)
                if self.elapsed >= Double(self.targetSeconds) && !self.isComplete {
                    self.isComplete = true
                    HapticManager.notification(.success)
                }
            }
    }

    func stop() {
        timer?.cancel()
        timer = nil
        isRunning = false
    }

    func reset() {
        stop()
        elapsed = 0
        isComplete = false
    }
}

struct RestTimerView: View {
    @Bindable var timer: RestTimerModel
    var suggestedSeconds: Int = 120
    var onReady: () -> Void

    private var contextLabel: String {
        suggestedSeconds >= 150 ? "gros exo" : "exo court"
    }

    private var statusLabel: String {
        timer.isComplete ? "Prêt" : "Repos"
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .stroke(Color.accentColor.opacity(0.15), lineWidth: 3)

                    Circle()
                        .trim(from: 0, to: timer.progress)
                        .stroke(
                            timer.isComplete ? Color.green : Color.accentColor,
                            style: StrokeStyle(lineWidth: 3, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))

                    Text(timer.remainingFormatted)
                        .font(.caption2.weight(.bold).monospacedDigit())
                        .foregroundStyle(timer.isComplete ? .green : .primary)
                }
                .frame(width: 40, height: 40)

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(statusLabel)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(timer.isComplete ? .green : Color.accentColor)
                        Text("· \(contextLabel)")
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    Text("\(suggestedSeconds)s")
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    timer.reset()
                    onReady()
                    HapticManager.impact(.medium)
                } label: {
                    Text(timer.isComplete ? "GO" : "Skip")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(timer.isComplete ? .white : .primary)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background(
                            timer.isComplete ? Color.green : Color.white.opacity(0.10),
                            in: Capsule()
                        )
                        .overlay {
                            if !timer.isComplete {
                                Capsule().stroke(.white.opacity(0.15), lineWidth: 0.5)
                            }
                        }
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 10) {
                Text(timer.elapsedFormatted)
                    .font(.system(size: 10, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(.secondary)

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.white.opacity(0.06))
                        Capsule()
                            .fill(timer.isComplete ? Color.green : Color.accentColor)
                            .frame(width: max(18, geo.size.width * timer.progress))
                    }
                }
                .frame(height: 6)

                Text(timer.isComplete ? "prêt" : statusLabel.lowercased())
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundStyle(timer.isComplete ? .green : .secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 11)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(red: 0.12, green: 0.13, blue: 0.19).opacity(0.98))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.10), lineWidth: 0.5)
        }
        .padding(.horizontal)
    }
}
