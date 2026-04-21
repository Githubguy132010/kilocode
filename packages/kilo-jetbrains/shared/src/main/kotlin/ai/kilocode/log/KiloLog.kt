package ai.kilocode.log

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import java.io.PrintWriter
import java.io.StringWriter
import java.lang.management.ManagementFactory
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.logging.FileHandler
import java.util.logging.Formatter
import java.util.logging.Level
import java.util.logging.LogRecord

interface KiloLog {
    fun debug(msg: String)
    fun info(msg: String)
    fun warn(msg: String, t: Throwable? = null)
    fun error(msg: String, t: Throwable? = null)

    companion object {
        private val sandbox = System.getProperty("idea.plugin.in.sandbox.mode", "false").toBoolean()

        fun create(cls: Class<*>): KiloLog {
            val intellij = IntellijLog(cls)
            if (!sandbox) return intellij
            return CompositeLog(intellij, FileLog(cls))
        }
    }
}

internal class IntellijLog(cls: Class<*>) : KiloLog {
    private val delegate = Logger.getInstance(cls)
    override fun debug(msg: String) = delegate.debug(msg)
    override fun info(msg: String) = delegate.info(msg)
    override fun warn(msg: String, t: Throwable?) {
        if (t != null) delegate.warn(msg, t) else delegate.warn(msg)
    }
    override fun error(msg: String, t: Throwable?) {
        if (t != null) delegate.error(msg, t) else delegate.error(msg)
    }
}

internal class FileLog(cls: Class<*>) : KiloLog {
    private val logger: java.util.logging.Logger

    init {
        logger = java.util.logging.Logger.getLogger(cls.name)
        logger.addHandler(handler)
        logger.useParentHandlers = false
        logger.level = level
    }

    companion object {
        private val level: Level by lazy { resolveLevel() }

        private val handler: FileHandler by lazy {
            val dir = resolveLogDir()
            val path = dir.resolve("kilo-dev.log")
            val h = FileHandler(path.toString(), true)
            h.formatter = KiloFormatter()
            h
        }

        private fun resolveLogDir(): Path {
            val dir = PathManager.getLogDir()
            var current = dir
            var side: String? = null
            while (current.parent != null) {
                val name = current.fileName.toString()
                if (name.startsWith("log_run")) {
                    side = if (name.lowercase().contains("frontend")) "kilo-frontend" else "kilo-backend"
                }
                if (name == "kilo.jetbrains" && side != null) {
                    val target = current.resolve(side)
                    Files.createDirectories(target)
                    return target
                }
                current = current.parent
            }
            return dir
        }

        private fun resolveLevel(): Level {
            val prop = System.getProperty("kilo.dev.log.level") ?: return Level.INFO
            return when (prop.uppercase()) {
                "DEBUG" -> Level.FINE
                "INFO" -> Level.INFO
                "WARN", "WARNING" -> Level.WARNING
                "ERROR" -> Level.SEVERE
                "OFF" -> Level.OFF
                else -> Level.ALL
            }
        }
    }

    override fun debug(msg: String) = logger.log(Level.FINE, msg)
    override fun info(msg: String) = logger.log(Level.INFO, msg)
    override fun warn(msg: String, t: Throwable?) {
        if (t != null) logger.log(Level.WARNING, msg, t) else logger.log(Level.WARNING, msg)
    }
    override fun error(msg: String, t: Throwable?) {
        if (t != null) logger.log(Level.SEVERE, msg, t) else logger.log(Level.SEVERE, msg)
    }
}

internal class KiloFormatter : Formatter() {
    private val start = ManagementFactory.getRuntimeMXBean().startTime
    private val fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss,SSS")

    override fun format(record: LogRecord): String {
        val time = Instant.ofEpochMilli(record.millis).atZone(ZoneId.systemDefault())
        val elapsed = record.millis - start
        val level = when (record.level) {
            Level.FINE -> "DEBUG"
            Level.INFO -> "INFO"
            Level.WARNING -> "WARN"
            Level.SEVERE -> "ERROR"
            else -> record.level.name
        }
        val category = record.loggerName ?: "kilo.dev"
        val sb = StringBuilder()
        sb.append(fmt.format(time))
        sb.append(" [")
        sb.append(elapsed.toString().padStart(8))
        sb.append("]   ")
        sb.append(level.padEnd(5))
        sb.append(" - #")
        sb.append(category)
        sb.append(" - ")
        sb.append(formatMessage(record))
        sb.append('\n')
        if (record.thrown != null) {
            val sw = StringWriter()
            record.thrown.printStackTrace(PrintWriter(sw))
            sb.append(sw)
        }
        return sb.toString()
    }
}

internal class CompositeLog(vararg val delegates: KiloLog) : KiloLog {
    override fun debug(msg: String) = delegates.forEach { it.debug(msg) }
    override fun info(msg: String) = delegates.forEach { it.info(msg) }
    override fun warn(msg: String, t: Throwable?) = delegates.forEach { it.warn(msg, t) }
    override fun error(msg: String, t: Throwable?) = delegates.forEach { it.error(msg, t) }
}
