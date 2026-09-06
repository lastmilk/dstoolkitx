<script setup lang="ts">
/**
 * Agreement.vue —— 服务协议 / 用户协议
 * 门户内的静态法律文档页，适配明暗主题。
 */
import { computed } from 'vue'
const updatedAt = computed(() => '2026 年 09 月 06 日')
</script>

<template>
  <div class="legal-page">
    <div class="legal-inner">
      <header class="legal-header">
        <h1 class="legal-title">服务协议</h1>
        <p class="legal-meta">最后更新于 {{ updatedAt }}</p>
      </header>

      <div class="legal-content">
        <p class="lead">
          欢迎使用 <strong>Deepseek Toolkit</strong>（以下简称"本服务"或"我们"）。本协议是您与本服务运营方之间就使用本服务所订立的协议。在您注册、登录或使用本服务前，请仔细阅读并充分理解本协议的全部内容。您点击"同意"或实际使用本服务，即视为您已阅读、理解并同意接受本协议的全部条款。
        </p>

        <h2>一、协议的接受与修改</h2>
        <ol>
          <li>本协议适用于您使用本服务的全部行为。若您不同意本协议任何条款，请立即停止注册或使用本服务。</li>
          <li>我们有权根据法律法规、监管要求或业务变化不时修订本协议。修订后的协议将在本服务内公布，自公布之日起生效。若您在协议修订后继续使用本服务，视为您接受修订后的协议。</li>
          <li>若您为未成年人，请在监护人指导下阅读本协议并使用本服务。</li>
        </ol>

        <h2>二、账号注册与安全</h2>
        <ol>
          <li>您在注册时应提供真实、准确、完整的信息，并在信息发生变更时及时更新。</li>
          <li>您应妥善保管账号和密码，对在您账号下发生的所有活动承担责任。如发现账号被盗用或存在安全风险，请立即通知我们。</li>
          <li>您承诺不将账号转让、出借或以任何方式允许第三方使用。因您保管不善导致的损失由您自行承担。</li>
          <li>我们可能要求您绑定手机号以使用云端同步、AI 续聊等部分功能，相关信息仅用于身份验证与安全保护。</li>
        </ol>

        <h2>三、服务内容</h2>
        <ol>
          <li>本服务为您提供 AI 对话数据的导入、浏览、检索、统计、导出、续聊、Agent 对话、记忆试卷生成等功能，具体以实际提供为准。</li>
          <li>我们可能根据业务需要调整、中断或终止部分功能，并将在合理范围内提前通知您。</li>
          <li>本服务中涉及的 AI 模型（包括但不限于续聊、Agent 对话）由第三方模型提供方支持，其输出内容仅供参考，不构成专业建议。我们不对模型输出的准确性、完整性、适用性作出保证。</li>
        </ol>

        <h2>四、用户行为规范</h2>
        <p>您在使用本服务时，应遵守相关法律法规，并不得从事以下行为：</p>
        <ol>
          <li>发布、传播违反法律法规、公序良俗或侵犯他人合法权益的内容；</li>
          <li>利用本服务从事危害网络安全、干扰本服务正常运行的行为，包括但不限于攻击、侵入、破解、逆向工程本服务；</li>
          <li>未经授权访问他人账号、数据或系统；</li>
          <li>批量滥用 AI 接口、绕过限流或进行任何形式的恶意刷量；</li>
          <li>将本服务用于任何违法或未经授权的商业用途；</li>
          <li>其他违反法律法规或本协议约定的行为。</li>
        </ol>
        <p>如您违反上述约定，我们有权视情节采取警告、限制功能、暂停或终止服务等措施，并保留追究法律责任的权利。</p>

        <h2>五、知识产权</h2>
        <ol>
          <li>本服务的软件、界面、商标、标识、文档及其他内容（不含用户上传内容）的知识产权归我们或相关权利人所有。</li>
          <li>您通过本服务导入、生成或上传的内容（包括但不限于对话数据、文本、文件）的知识产权归您或相关权利人所有，您授予我们在提供服务所必需的范围内使用、存储、处理这些内容的权利。</li>
          <li>未经我们书面许可，您不得复制、修改、分发本服务的任何部分或衍生作品。</li>
        </ol>

        <h2>六、数据与隐私</h2>
        <p>我们高度重视您的个人信息与数据保护。关于我们如何收集、使用、存储和保护您的信息，请参阅《隐私政策》。本协议与《隐私政策》共同构成您与我们之间的完整约定。</p>

        <h2>七、付费与退款</h2>
        <ol>
          <li>本服务可能提供付费订阅、积分充值等增值服务。具体价格、权益和有效期以购买页面公示为准。</li>
          <li>付费服务一经开通，除法律法规另有规定或页面另有说明外，原则上不支持退款。如遇服务故障或您有合理理由，可联系客服协商处理。</li>
          <li>您应通过本服务官方渠道进行支付，因通过非官方渠道支付造成的损失由您自行承担。</li>
        </ol>

        <h2>八、免责声明</h2>
        <ol>
          <li>本服务按"现状"提供，我们不对服务的可用性、及时性、准确性或适用性作出任何明示或暗示的保证。</li>
          <li>因不可抗力、系统故障、网络中断、第三方模型服务异常等原因导致服务中断或数据丢失的，我们不承担责任，但将尽力协助恢复。</li>
          <li>AI 模型输出的内容可能存在错误、偏见或不完整，您应自行判断并承担使用后果。</li>
          <li>您通过本服务与第三方（包括模型提供方、支付渠道等）发生的交易或纠纷，由您与第三方自行解决，我们不承担连带责任。</li>
        </ol>

        <h2>九、协议的终止</h2>
        <ol>
          <li>您可随时停止使用本服务并注销账号。账号注销后，相关数据可能无法恢复，请您提前备份。</li>
          <li>若您严重违反本协议或法律法规，我们有权立即终止向您提供服务，并删除相关内容。</li>
          <li>协议终止后，本协议中关于知识产权、免责、争议解决等条款仍然有效。</li>
        </ol>

        <h2>十、争议解决</h2>
        <ol>
          <li>本协议的订立、执行和解释均适用中华人民共和国法律。</li>
          <li>因本协议或本服务产生的争议，双方应友好协商解决；协商不成的，任何一方均可向我们运营方所在地有管辖权的人民法院提起诉讼。</li>
        </ol>

        <h2>十一、联系我们</h2>
        <p>如您对本协议有任何疑问或建议，可通过本服务内的联系方式与我们取得联系。</p>

        <p class="closing">
          感谢您的信任与支持，祝您使用愉快！
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal-page {
  width: 100%;
  background: var(--el-bg-color);
  padding: 48px 24px 64px;
}
.legal-inner {
  max-width: 820px;
  margin: 0 auto;
}
.legal-header {
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.legal-title {
  margin: 0 0 8px;
  font-size: 30px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.legal-meta {
  margin: 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.legal-content {
  font-size: 15px;
  line-height: 1.85;
  color: var(--el-text-color-regular);
}
.legal-content h2 {
  margin: 32px 0 14px;
  font-size: 19px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
.legal-content h2:first-of-type {
  margin-top: 24px;
}
.legal-content p {
  margin: 12px 0;
}
.legal-content ol {
  margin: 12px 0;
  padding-left: 22px;
}
.legal-content li {
  margin: 8px 0;
}
.lead {
  font-size: 15.5px;
  color: var(--el-text-color-regular);
}
.closing {
  margin-top: 36px;
  padding-top: 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
}

@media (max-width: 640px) {
  .legal-page {
    padding: 28px 16px 48px;
  }
  .legal-title {
    font-size: 24px;
  }
  .legal-content {
    font-size: 14.5px;
  }
}
</style>
