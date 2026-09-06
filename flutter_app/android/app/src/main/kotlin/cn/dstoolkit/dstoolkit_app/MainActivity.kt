package cn.dstoolkit.dstoolkit_app

import android.os.Handler
import android.os.Looper
import com.geetest.captcha.GTCaptcha4Client
import com.geetest.captcha.GTCaptcha4Config
import com.mobile.auth.gatewayauth.PhoneNumberAuthHelper
import com.mobile.auth.gatewayauth.ResultCode
import com.mobile.auth.gatewayauth.TokenResultListener
import com.mobile.auth.gatewayauth.model.TokenRet
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONObject

class MainActivity : FlutterActivity() {
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "dstoolkit/auth").setMethodCallHandler { call, result ->
            when (call.method) {
                "geetestVerify" -> {
                    val captchaId = call.argument<String>("captchaId") ?: ""
                    geetestVerify(captchaId, result)
                }
                "numberAuthCheckEnv" -> {
                    try {
                        val helper = PhoneNumberAuthHelper.getInstance(applicationContext, null)
                        result.success(helper.checkEnvAvailable())
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "numberAuthGetLoginToken" -> {
                    val timeout = call.argument<Int>("timeoutMs") ?: 5000
                    numberAuthGetLoginToken(timeout, result)
                }
                "numberAuthQuit" -> {
                    try {
                        PhoneNumberAuthHelper.getInstance(applicationContext, null).quitLoginPage()
                    } catch (_: Exception) {
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    /** 极验 GT4 行为验证：弹出验证页，成功返回二次校验四参数 */
    private fun geetestVerify(captchaId: String, result: MethodChannel.Result) {
        val config = GTCaptcha4Config.Builder().build()
        val client = GTCaptcha4Client.getClient(this)
        client
            .init(captchaId, config)
            .addOnSuccessListener { status, response ->
                if (status) {
                    try {
                        // response 为 JSON 字符串：lot_number/captcha_output/pass_token/gen_time
                        val json = JSONObject(response ?: "{}")
                        val payload = mapOf(
                            "lot_number" to json.optString("lot_number"),
                            "captcha_output" to json.optString("captcha_output"),
                            "pass_token" to json.optString("pass_token"),
                            "gen_time" to json.optString("gen_time"),
                        )
                        if (payload["lot_number"]?.isNotEmpty() == true) {
                            result.success(payload)
                        } else {
                            result.error("GEETEST_FAILED", "验证结果解析失败", null)
                        }
                    } catch (e: Exception) {
                        result.error("GEETEST_FAILED", e.message, null)
                    }
                } else {
                    result.error("GEETEST_FAILED", "验证未通过", null)
                }
            }
            .addOnFailureListener { error ->
                result.error("GEETEST_ERROR", error?.message ?: "验证加载失败", null)
            }
    }

    /** 阿里云一键登录：拉起运营商授权页，成功返回 accessToken（getMobile 用） */
    private fun numberAuthGetLoginToken(timeoutMs: Int, result: MethodChannel.Result) {
        val listener = object : TokenResultListener {
            override fun onTokenSuccess(s: String?) {
                mainHandler.post {
                    try {
                        val ret = TokenRet.fromJson(s ?: "{}")
                        if (ResultCode.CODE_SUCCESS == ret.code && !ret.token.isNullOrEmpty()) {
                            helper?.setAuthListener(null)
                            result.success(ret.token)
                        } else if (ResultCode.CODE_START_AUTHPAGE_SUCCESS != ret.code) {
                            // 授权页拉起成功的事件忽略，只处理最终结果
                            helper?.setAuthListener(null)
                            result.error("NUMBER_AUTH_FAILED", ret.code, ret.msg)
                        }
                    } catch (e: Exception) {
                        helper?.setAuthListener(null)
                        result.error("NUMBER_AUTH_ERROR", e.message, null)
                    }
                }
            }

            override fun onTokenFailed(s: String?) {
                mainHandler.post {
                    helper?.setAuthListener(null)
                    try {
                        val ret = TokenRet.fromJson(s ?: "{}")
                        result.error("NUMBER_AUTH_FAILED", ret.code, ret.msg)
                    } catch (_: Exception) {
                        result.error("NUMBER_AUTH_FAILED", "UNKNOWN", s)
                    }
                }
            }
        }
        helper = PhoneNumberAuthHelper.getInstance(applicationContext, listener)
        helper?.getLoginToken(this, timeoutMs)
    }

    private var helper: PhoneNumberAuthHelper? = null

    override fun onDestroy() {
        try {
            helper?.setAuthListener(null)
            helper?.quitLoginPage()
        } catch (_: Exception) {
        }
        helper = null
        super.onDestroy()
    }
}
