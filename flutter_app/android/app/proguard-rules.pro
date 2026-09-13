# R8: 阿里云号码认证 aar 传递依赖 Apache Tika 引用了桌面 JDK 的 javax.xml.stream，
# Android 运行时不存在该包，忽略警告即可（对应路径不会执行）。
-dontwarn javax.xml.stream.XMLStreamException
